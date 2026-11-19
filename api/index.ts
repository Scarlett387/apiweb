import { existsSync, mkdirSync } from 'fs'
import { chdir } from 'process'

// Vercel 函数目录只读，切到 /tmp 并建空 public 供 @fastify/static 注册
if (!existsSync('/tmp/public')) {
  mkdirSync('/tmp/public', { recursive: true })
}
chdir('/tmp')

let appPromise: Promise<any> | null = null

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const mod: any = await import('../apps/api/dist/server.js')
      const app = mod.app ?? mod.default
      if (!app) throw new Error('server.js did not export app')
      await app.ready()
      return app
    })()
  }
  return appPromise
}

export default async function handler(req: any, res: any) {
  try {
    const app = await getApp()
    app.server.emit('request', req, res)
  } catch (e: any) {
    res.statusCode = 500
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: String(e?.message || e), stack: String(e?.stack || '').split('\n').slice(0, 8) }))
  }
}
