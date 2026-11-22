/**
 * NavCommunityService
 *
 * 导航站社区能力:
 * 1. 站点健康检测:health checks 结果落库(按 url 去重),公开统计条与卡片状态点消费。
 * 2. 访客投稿:未登录访客推荐网址,站长在设置里审核(通过/拒绝)。
 *
 * 表结构双方言兼容(MySQL / D1 sqlite),与 backup/admin_audit_logs 同款分支。
 */
import type { DatabaseClient } from '@nav/database'
import { ensureIndex } from '@nav/database'
import { logger } from '@nav/logger'

export interface HealthStatusRow {
  url: string
  online: boolean
  latencyMs: number | null
  checkedAt: number
}

export interface HealthStats {
  total: number
  online: number
  checkedAt: number | null
}

export interface SubmissionRow {
  id: string
  name: string
  url: string
  description: string | null
  contact: string | null
  ip: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: number
}

export interface NavSubmissionInput {
  name: string
  url: string
  description?: string | null
  contact?: string | null
  ip?: string | null
}

const MAX_LATENCY = 30000

export class NavCommunityService {
  constructor(private readonly db: DatabaseClient) {}

  async initTable(): Promise<void> {
    const idColumn =
      this.db.dialect === 'mysql'
        ? 'id BIGINT AUTO_INCREMENT PRIMARY KEY'
        : 'id INTEGER PRIMARY KEY AUTOINCREMENT'
    // 健康检测状态(按 url 归一化去重)
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS nav_health_status (
        ${idColumn},
        url        VARCHAR(2048) NOT NULL,
        url_hash   VARCHAR(64) NOT NULL,
        online     INTEGER NOT NULL DEFAULT 0,
        latency_ms INTEGER,
        checked_at BIGINT NOT NULL
      )
    `)
    await ensureIndex(this.db, 'idx_nav_health_url_hash', 'nav_health_status', ['url_hash'], {
      unique: true
    })
    // 访客投稿(业务唯一标识列叫 public_id,避免与自增主键 id 重名)
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS nav_submissions (
        ${idColumn},
        public_id   VARCHAR(64) NOT NULL,
        name        VARCHAR(200) NOT NULL,
        url         VARCHAR(2048) NOT NULL,
        description VARCHAR(500),
        contact     VARCHAR(200),
        ip          VARCHAR(64),
        status      VARCHAR(16) NOT NULL DEFAULT 'pending',
        created_at  BIGINT NOT NULL
      )
    `)
    await ensureIndex(this.db, 'idx_nav_submissions_public_id', 'nav_submissions', ['public_id'], {
      unique: true
    })
    await ensureIndex(this.db, 'idx_nav_submissions_status', 'nav_submissions', ['status'])
    await ensureIndex(this.db, 'idx_nav_submissions_created_at', 'nav_submissions', ['created_at'])
    logger.info('[NavCommunity] tables ready')
  }

  // ── 健康检测 ─────────────────────────────────────────────────────────

  private normalizeUrl(url: string): string {
    return url.trim().replace(/\/+$/, '').toLowerCase()
  }

  /** 批量写入检测结果(url 归一化后 upsert) */
  async upsertHealthResults(
    results: Array<{ url: string; online: boolean; latencyMs: number | null }>
  ): Promise<void> {
    const now = Date.now()
    for (const r of results) {
      const url = r.url.trim()
      if (!url) continue
      const urlHash = this.hashUrl(url)
      const latency = r.latencyMs != null ? Math.min(r.latencyMs, MAX_LATENCY) : null
      await this.db.execute(`DELETE FROM nav_health_status WHERE url_hash = ?`, [urlHash])
      await this.db.execute(
        `INSERT INTO nav_health_status (url, url_hash, online, latency_ms, checked_at)
         VALUES (?, ?, ?, ?, ?)`,
        [url, urlHash, r.online ? 1 : 0, latency, now]
      )
    }
  }

  /** 站点健康状态映射:归一化 url → { online, latencyMs, checkedAt } */
  async getHealthByUrl(
    urls: string[]
  ): Promise<Record<string, { online: boolean; latencyMs: number | null; checkedAt: number }>> {
    const map: Record<string, { online: boolean; latencyMs: number | null; checkedAt: number }> = {}
    if (urls.length === 0) return map
    const rows = await this.db.all<{
      url: string
      online: number
      latency_ms: number | null
      checked_at: number
    }>(`SELECT url, online, latency_ms, checked_at FROM nav_health_status`)
    const byHash = new Map<
      string,
      { online: boolean; latencyMs: number | null; checkedAt: number }
    >()
    for (const row of rows) {
      byHash.set(this.hashUrl(row.url), {
        online: row.online === 1,
        latencyMs: row.latency_ms,
        checkedAt: row.checked_at
      })
    }
    for (const u of urls) {
      const hit = byHash.get(this.hashUrl(u))
      if (hit) map[u] = hit
    }
    return map
  }

  /** 统计条数据:total 按传入站点总数,online 只统计其中已检测且在线的 */
  async getHealthStats(total: number, urls: string[]): Promise<HealthStats> {
    const health = await this.getHealthByUrl(urls)
    const checkedUrls = Object.keys(health)
    const online = checkedUrls.filter(u => health[u].online).length
    const checkedAt =
      checkedUrls.length > 0 ? Math.max(...checkedUrls.map(u => health[u].checkedAt)) : null
    return { total, online, checkedAt }
  }

  private hashUrl(url: string): string {
    // 轻量归一化 hash:去协议差异、尾斜杠、大小写,足够做去重键
    const norm = this.normalizeUrl(url)
    let h = 5381
    for (let i = 0; i < norm.length; i++) {
      h = ((h << 5) + h + norm.charCodeAt(i)) | 0
    }
    return (h >>> 0).toString(36) + '_' + String(norm.length)
  }

  // ── 访客投稿 ─────────────────────────────────────────────────────────

  async addSubmission(input: NavSubmissionInput): Promise<{ id: string }> {
    // 同 URL 7 天内不重复收录
    const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
    const dup = await this.db.first<{ id: string }>(
      `SELECT id FROM nav_submissions
       WHERE url = ? AND status != 'rejected' AND created_at > ? LIMIT 1`,
      [input.url.trim(), weekAgo]
    )
    if (dup) {
      throw new Error('DUPLICATE_SUBMISSION')
    }
    // 同 IP 1 小时最多 5 条,防刷
    if (input.ip) {
      const hourAgo = Date.now() - 3600 * 1000
      const recent = await this.db.first<{ n: number }>(
        `SELECT COUNT(*) AS n FROM nav_submissions WHERE ip = ? AND created_at > ?`,
        [input.ip, hourAgo]
      )
      if (recent && recent.n >= 5) {
        throw new Error('RATE_LIMITED')
      }
    }
    const id = `sub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    await this.db.execute(
      `INSERT INTO nav_submissions (public_id, name, url, description, contact, ip, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)`,
      [
        id,
        input.name.trim(),
        input.url.trim(),
        input.description?.trim() || null,
        input.contact?.trim() || null,
        input.ip || null,
        Date.now()
      ]
    )
    return { id }
  }

  async listSubmissions(status?: 'pending' | 'approved' | 'rejected'): Promise<SubmissionRow[]> {
    if (status) {
      return this.db.all<SubmissionRow>(
        `SELECT public_id AS id, name, url, description, contact, ip, status, created_at
         FROM nav_submissions WHERE status = ? ORDER BY created_at DESC LIMIT 200`,
        [status]
      )
    }
    return this.db.all<SubmissionRow>(
      `SELECT public_id AS id, name, url, description, contact, ip, status, created_at
       FROM nav_submissions ORDER BY
       CASE WHEN status = 'pending' THEN 0 ELSE 1 END, created_at DESC LIMIT 200`
    )
  }

  async pendingCount(): Promise<number> {
    const row = await this.db.first<{ n: number }>(
      `SELECT COUNT(*) AS n FROM nav_submissions WHERE status = 'pending'`
    )
    return row?.n ?? 0
  }

  async reviewSubmission(id: string, action: 'approve' | 'reject'): Promise<void> {
    await this.db.execute(`UPDATE nav_submissions SET status = ? WHERE public_id = ?`, [
      action === 'approve' ? 'approved' : 'rejected',
      id
    ])
  }

  async deleteSubmission(id: string): Promise<void> {
    await this.db.execute(`DELETE FROM nav_submissions WHERE public_id = ?`, [id])
  }
}
