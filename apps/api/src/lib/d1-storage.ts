/**
 * 基于 D1 的存储客户端（Cloudflare Workers 专用）。
 *
 * 背景：Workers 运行时没有持久文件系统，LocalClient（./public/storage-fallback）
 * 写入的数据在 isolate 冷启动后丢失。云端同步快照、手动备份与站点图标都必须
 * 持久化，因此在未配置 R2/S3/WebDAV 时，把 backup/public 存储落到 D1 storage_blobs 表。
 *
 * 二进制内容（图标等）以 base64 编码存储；文本（JSON 快照）原样存储。
 * 公开访问通过 GET /api/storage/blob/<key> 端点完成。
 */
import type { Readable } from 'stream'
import type { StorageClient } from '@nav/storage'

type UploadBody = string | Buffer | Readable | ReadableStream | ArrayBuffer

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement
  run(): Promise<unknown>
  first<T = Record<string, unknown>>(): Promise<T | null>
}

interface D1Binding {
  prepare(query: string): D1PreparedStatement
}

export interface BinaryBlob {
  data: Uint8Array
  contentType: string
}

const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS storage_blobs (
    key          TEXT PRIMARY KEY,
    content      TEXT NOT NULL,
    content_type TEXT,
    size         INTEGER NOT NULL DEFAULT 0,
    updated_at   INTEGER NOT NULL
  );
`

const ENCODING_COLUMN_SQL = `
  ALTER TABLE storage_blobs ADD COLUMN encoding TEXT NOT NULL DEFAULT 'utf8';
`

const decoder = new TextDecoder()
const encoder = new TextEncoder()

export class D1StorageClient implements StorageClient {
  private readonly binding: D1Binding
  private tableReady: Promise<void> | null = null

  constructor(binding: unknown) {
    this.binding = binding as D1Binding
  }

  private async ensureTable(): Promise<void> {
    if (!this.tableReady) {
      this.tableReady = (async () => {
        await this.binding.prepare(TABLE_SQL).run()
        // 兼容旧表结构（无 encoding 列）：已存在时忽略报错
        try {
          await this.binding.prepare(ENCODING_COLUMN_SQL).run()
        } catch {
          // column already exists
        }
      })()
      this.tableReady.catch(() => {
        // 下一次调用重试建表
        this.tableReady = null
      })
    }
    await this.tableReady
  }

  private static toBytes(body: UploadBody): { bytes: Uint8Array; isText: boolean } {
    if (typeof body === 'string') {
      return { bytes: encoder.encode(body), isText: true }
    }
    if (body instanceof ArrayBuffer) {
      return { bytes: new Uint8Array(body), isText: false }
    }
    if (body instanceof Uint8Array) {
      return { bytes: body, isText: false }
    }
    throw new Error('D1StorageClient 仅支持字符串/Buffer 输入')
  }

  async upload(
    key: string,
    body: UploadBody,
    contentType = 'application/octet-stream'
  ): Promise<void> {
    await this.ensureTable()
    const { bytes, isText } = D1StorageClient.toBytes(body)
    const content = isText ? decoder.decode(bytes) : Buffer.from(bytes).toString('base64')
    const encoding = isText ? 'utf8' : 'base64'
    await this.binding
      .prepare(
        `INSERT INTO storage_blobs (key, content, content_type, size, updated_at, encoding)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           content = excluded.content,
           content_type = excluded.content_type,
           size = excluded.size,
           updated_at = excluded.updated_at,
           encoding = excluded.encoding`
      )
      .bind(key, content, contentType, bytes.length, Date.now(), encoding)
      .run()
  }

  async get(key: string): Promise<string> {
    await this.ensureTable()
    const row = await this.binding
      .prepare('SELECT content, encoding FROM storage_blobs WHERE key = ?')
      .bind(key)
      .first<{ content: string; encoding?: string }>()
    if (!row) throw new Error(`Storage object not found: ${key}`)
    return row.encoding === 'base64'
      ? Buffer.from(row.content, 'base64').toString('utf8')
      : row.content
  }

  /** 读取原始二进制（公开 blob 端点使用），不存在时返回 null */
  async getBinary(key: string): Promise<BinaryBlob | null> {
    await this.ensureTable()
    const row = await this.binding
      .prepare('SELECT content, content_type, encoding FROM storage_blobs WHERE key = ?')
      .bind(key)
      .first<{ content: string; content_type: string | null; encoding?: string }>()
    if (!row) return null
    const data =
      row.encoding === 'base64'
        ? new Uint8Array(Buffer.from(row.content, 'base64'))
        : encoder.encode(row.content)
    return { data, contentType: row.content_type || 'application/octet-stream' }
  }

  async delete(key: string): Promise<void> {
    await this.ensureTable()
    await this.binding.prepare('DELETE FROM storage_blobs WHERE key = ?').bind(key).run()
  }

  async exists(key: string): Promise<string | null> {
    await this.ensureTable()
    const row = await this.binding
      .prepare('SELECT key FROM storage_blobs WHERE key = ?')
      .bind(key)
      .first<{ key: string }>()
    return row ? this.getPublicUrl(key) : null
  }

  /** 通过公开端点访问（浏览器可直接加载图片等） */
  getPublicUrl(key: string): string {
    return `/api/storage/blob/${key}`
  }

  async store(key: string, data: ArrayBuffer, contentType: string): Promise<string> {
    await this.upload(key, data, contentType)
    return this.getPublicUrl(key)
  }
}
