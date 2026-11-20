import { logger } from '@nav/logger'
import { wrapDatabaseError } from '../errors.js'
import type {
  DatabaseClient,
  DatabaseDialect,
  DatabaseExecuteResult,
  DatabaseStatement
} from '../types.js'

/**
 * Native D1 binding client for Cloudflare Workers.
 *
 * Instead of calling the D1 HTTP API with an account/token, this client talks
 * to the D1 database through the Worker's native `env.DB` binding — faster,
 * free of HTTP overhead, and requires no API token at all.
 *
 * The binding types below are intentionally minimal/structural so this package
 * stays free of a hard dependency on @cloudflare/workers-types.
 */

export interface D1BindingMeta {
  changes?: number
  last_row_id?: number | bigint
  duration?: number
  rows_read?: number
  rows_written?: number
}

export interface D1BindingPreparedStatement {
  bind(...values: unknown[]): D1BindingPreparedStatement
  first<T = unknown>(colName?: string): Promise<T | null>
  all<T = unknown>(): Promise<{ results?: T[]; meta?: D1BindingMeta }>
  run(): Promise<{ meta?: D1BindingMeta }>
}

export interface D1DatabaseBinding {
  prepare(query: string): D1BindingPreparedStatement
  batch<T = unknown>(
    statements: D1BindingPreparedStatement[]
  ): Promise<{ results?: T[]; meta?: D1BindingMeta }[]>
}

export interface D1BindingClientConfig {
  binding: D1DatabaseBinding
}

/** 原生 D1 绑定拒绝 undefined 值（HTTP API 会静默转 null），这里统一规范化 */
function normalizeParams(params: unknown[] = []): unknown[] {
  return params.map(p => (p === undefined ? null : p))
}

export class D1BindingClient implements DatabaseClient {
  readonly dialect: DatabaseDialect = 'sqlite'

  private db: D1DatabaseBinding

  constructor(config: D1BindingClientConfig) {
    this.db = config.binding
  }

  /** Execute a statement and return normalized mutation metadata. */
  async execute(sql: string, params: unknown[] = []): Promise<DatabaseExecuteResult> {
    try {
      const stmt = this.db.prepare(sql).bind(...normalizeParams(params))
      const { meta } = await stmt.run()
      return this.mapMeta(meta)
    } catch (error) {
      logger.error({ error }, 'D1 Binding Execution Failed')
      throw wrapDatabaseError(error)
    }
  }

  async first<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
    try {
      const stmt = this.db.prepare(sql).bind(...normalizeParams(params))
      const { results } = await stmt.all<T>()
      return results && results.length > 0 ? results[0] : null
    } catch (error) {
      logger.error({ error }, 'D1 Binding Query Failed (first)')
      throw wrapDatabaseError(error)
    }
  }

  async all<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    try {
      const stmt = this.db.prepare(sql).bind(...normalizeParams(params))
      const { results } = await stmt.all<T>()
      return results || []
    } catch (error) {
      logger.error({ error }, 'D1 Binding Query Failed (all)')
      throw wrapDatabaseError(error)
    }
  }

  /** Execute multiple statements in a single native batch (transactional). */
  async batch(statements: DatabaseStatement[]): Promise<DatabaseExecuteResult[]> {
    try {
      const stmts = statements.map(stmt =>
        this.db.prepare(stmt.sql).bind(...normalizeParams(stmt.params))
      )
      const results = await this.db.batch(stmts)
      return results.map(result => this.mapMeta(result.meta))
    } catch (error: unknown) {
      logger.error({ error }, 'D1 Binding Batch Execution Failed')
      throw wrapDatabaseError(error)
    }
  }

  private mapMeta(meta?: D1BindingMeta): DatabaseExecuteResult {
    return {
      changes: meta?.changes,
      lastInsertRowid: meta?.last_row_id !== undefined ? Number(meta.last_row_id) : undefined
    }
  }
}
