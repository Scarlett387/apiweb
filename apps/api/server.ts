import { join } from 'path'
import { config } from '@nav/config'
import { buildApp } from './app.js'

// Node/Docker/Vercel 运行时入口：构建应用（含静态文件）并监听端口。
// Cloudflare Workers 入口见 worker.ts。

const { app, initAppServices } = await buildApp({ registerStatic: true })

// Start server
const start = async () => {
  try {
    // Initialize services (DB tables, etc.)
    // 数据库不可用时不再 fail-fast：服务照常监听（请求期错误由全局
    // 503 信封兜住），并在后台按间隔重试初始化，数据库恢复后自愈。
    const RETRY_INTERVAL_MS = 10_000
    const scheduleDbInitRetry = () => {
      const timer = setTimeout(async () => {
        try {
          await initAppServices()
          app.log.info('Database became available, services initialized')
        } catch (retryErr) {
          app.log.warn({ err: retryErr }, 'Database still unavailable, will retry')
          scheduleDbInitRetry()
        }
      }, RETRY_INTERVAL_MS)
      timer.unref()
    }

    try {
      await initAppServices()
    } catch (initErr) {
      app.log.error(
        { err: initErr },
        'Database unavailable at startup, serving degraded until it recovers'
      )
      scheduleDbInitRetry()
    }

    const port = config.server.port
    await app.listen({ port, host: '0.0.0.0' })
    app.log.info(`Server listening on port ${port} in ${config.server.env} mode`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

start()

// Graceful Shutdown
const signals = ['SIGTERM', 'SIGINT'] as const

signals.forEach(signal => {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, shutting down...`)
    await app.close()
    process.exit(0)
  })
})
export { app }
