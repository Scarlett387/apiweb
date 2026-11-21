/**
 * 基于 D1 的存储客户端（Cloudflare Workers 专用）。
 *
 * 背景：Workers 运行时没有持久文件系统，LocalClient（./public/storage-fallback）
 * 写入的数据在 isolate 冷启动后丢失。云端同步快照与手动备份都必须持久化，
 * 因此在未配置 R2/S3/WebDAV 时，把 backup 存储落到 D1 的 storage_blobs 表。
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

const TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS storage_blobs (
    key         TEXT PRIMARY KEY,
    content     TEXT NOT NULL,
    content_type TEXT,
    size        INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL
  );
`

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
      })()
      this.tableReady.catch(() => {
        // 下一次调用重试建表
        this.tableReady = null
      })
    }
    await this.tableReady
  }

  private static toText(body: UploadBody): string {
    if (typeof body === 'string') return body
    if (body instanceof ArrayBuffer) return new TextDecoder().decode(body)
    if (body instanceof Uint8Array) return new TextDecoder().decode(body)
    throw new Error('D1StorageClient 仅支持字符串/Buffer 输入')
  }

  async upload(
    key: string,
    body: UploadBody,
    contentType = 'application/octet-stream'
  ): Promise<void> {
    await this.ensureTable()
    const content = D1StorageClient.toText(body)
    await this.binding
      .prepare(
        `INSERT INTO storage_blobs (key, content, content_type, size, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           content = excluded.content,
           content_type = excluded.content_type,
           size = excluded.size,
           updated_at = excluded.updated_at`
      )
      .bind(key, content, contentType, content.length, Date.now())
      .run()
  }

  async get(key: string): Promise<string> {
    await this.ensureTable()
    const row = await this.binding
      .prepare('SELECT content FROM storage_blobs WHERE key = ?')
      .bind(key)
      .first<{ content: string }>()
    if (!row) throw new Error(`Storage object not found: ${key}`)
    return row.content
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

  /** D1 blob 无法直接公开访问；备份/同步场景不依赖该 URL */
  getPublicUrl(key: string): string {
    return `d1-blob://${key}`
  }

  async store(key: string, data: ArrayBuffer, contentType: string): Promise<string> {
    await this.upload(key, data, contentType)
    return this.getPublicUrl(key)
  }
}
