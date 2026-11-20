import { existsSync, mkdirSync } from 'fs'
import { chdir } from 'process'

// Vercel 函数目录只读，切到 /tmp 并建空 public 供 @fastify/static 注册
if (!existsSync('/tmp/public')) {
  mkdirSync('/tmp/public', { recursive: true })
}
chdir('/tmp') // 修复：原来写成 ' /tmp '，路径带了空格

let appPromise: Promise<any> | null = null

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      const mod: any = await import('../apps/api/dist/server.js')
      console.log('server.js 导出:', Object.keys(mod)) // 打印实际导出内容，便于排查
      const app = mod.app ?? mod.default
      if (!app || typeof app.ready !== 'function') {
        throw new Error(
          'server.js 没有导出可用的 app，实际导出: ' + Object.keys(mod).join(', ')
        )
      }
      await app.ready()
      return app
    })().catch((e) => {
      appPromise = null // 失败不缓存，下次请求可重试
      throw e
    })
  }
  return appPromise
}

export default async function handler(req: any, res: any) {
  try {
    const app = await getApp()
    app.server.emit('request', req, res)
  } catch (e: any) {
    res.statusCode = 503
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(
      JSON.stringify({
        error: String(e?.message || e),
        stack: String(e?.stack || '').split('\n').slice(0, 8)
      })
    )
  }
}

