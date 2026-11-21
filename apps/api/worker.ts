/**
 * Cloudflare Workers 运行时入口。
 *
 * 原理：Cloudflare Workers 自 2025-09 起原生支持 node:http 服务器 API。
 * 这里创建一个 node:http Server，把收到的请求转发给 Fastify 应用
 * （app.server.emit('request') 是 Fastify 官方的 serverless 挂载方式），
 * 再通过官方的 httpServerHandler 桥接到 Workers fetch 事件。
 *
 * 注意事项：
 * - Workers 全局作用域禁止随机数/定时器/IO，因此应用构建、服务初始化
 *   全部推迟到首个请求（惰性初始化）。
 * - 静态前端文件由 Workers Assets 托管（见根目录 wrangler.jsonc）。
 * - 数据库通过 env.DB 原生绑定直连 D1（无需 API Token）。
 */
import { createServer } from 'node:http'
import { httpServerHandler } from 'cloudflare:node'
import type { FastifyInstance } from 'fastify'
import { D1BindingClient } from '@nav/database'
import { buildApp } from './app.js'
import { databaseClient, dynamicBackupStorage } from './src/services.js'
import { D1StorageClient } from './src/lib/d1-storage.js'

type WorkerHandler = ReturnType<typeof httpServerHandler>

type AppState = {
  app: FastifyInstance
  handler: WorkerHandler
  initAppServices: () => Promise<void>
  d1Storage: D1StorageClient | null
}

let appStatePromise: Promise<AppState> | null = null
let servicesReady = false

async function createAppState(env: Record<string, unknown>): Promise<AppState> {
  const { app, initAppServices } = await buildApp({
    registerStatic: false,
    logger: false // workerd 不支持 pino 传输器；使用 Fastify 内置日志器
  })

  // D1 原生绑定直连（优先于 HTTP API 客户端）
  const dbBinding = env.DB
  const d1Storage = dbBinding ? new D1StorageClient(dbBinding) : null
  if (dbBinding) {
    databaseClient.setClient(new D1BindingClient({ binding: dbBinding as never }))
    app.log.info('D1 native binding activated')
  }

  const nodeServer = createServer((req, res) => {
    // Fastify 官方 serverless 挂载方式
    app.server.emit('request', req, res)
  })
  const handler = httpServerHandler(nodeServer)

  // Workers 的 IncomingMessage 没有 socket，fastify 的 req.ip（getter）会取到
  // undefined，导致写库报错。这里用 CDN/代理头兜底（Cloudflare 提供 cf-connecting-ip）。
  app.addHook('onRequest', async req => {
    if (typeof req.ip !== 'string') {
      const h = req.headers
      const ip =
        (h['cf-connecting-ip'] as string) ||
        (h['x-real-ip'] as string) ||
        (h['x-forwarded-for'] as string) ||
        '0.0.0.0'
      Object.defineProperty(req, 'ip', {
        value: ip.split(',')[0].trim(),
        writable: true,
        configurable: true
      })
    }
  })

  // 完成 avvio 插件装配（路由上下文/钩子只在 preReady 后就绪）
  await app.ready()

  return { app, handler, initAppServices, d1Storage }
}

/** 构建应用 + 桥接 node:http <-> Workers（仅执行一次） */
function getAppState(env: Record<string, unknown>): Promise<AppState> {
  if (!appStatePromise) {
    appStatePromise = createAppState(env)
  }
  return appStatePromise
}

/** 服务初始化（建表等）：失败不阻断请求，由 Fastify 全局 503 信封兜底，下个请求重试 */
async function ensureServicesReady(state: AppState): Promise<void> {
  if (servicesReady) return
  try {
    await state.initAppServices()
    // storage_purpose_configs 无配置时 initServices 会回退到 LocalClient——
    // workerd 文件系统不持久，快照/备份会丢。未配置外部存储时改用 D1 blob 表。
    if (state.d1Storage) {
      const configured = await databaseClient.first(
        'SELECT purpose FROM storage_purpose_configs LIMIT 1'
      )
      if (!configured) {
        dynamicBackupStorage.setClient(state.d1Storage)
        state.app.log.info('Backup storage switched to D1 blobs (no external storage configured)')
      }
    }
    servicesReady = true
    state.app.log.info('Services initialized (workers)')
  } catch (err) {
    state.app.log.warn({ err }, 'Service init failed (will retry on next request)')
  }
}

export default {
  async fetch(request: Request, env: Record<string, unknown>, ctx: unknown): Promise<Response> {
    let state: AppState
    try {
      state = await getAppState(env)
    } catch (err) {
      console.error('Worker bootstrap failed:', err)
      return new Response(
        JSON.stringify({
          success: false,
          code: 'SERVICE_UNAVAILABLE',
          message: '服务暂时不可用，请稍后重试'
        }),
        { status: 503, headers: { 'content-type': 'application/json; charset=utf-8' } }
      )
    }

    await ensureServicesReady(state)
    return state.handler.fetch!(request, env, ctx)
  }
}
