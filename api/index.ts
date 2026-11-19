import { existsSync, mkdirSync } from 'fs'
import { chdir } from 'process'

// Vercel 函数目录只读且没有 public/，切到 /tmp 建一个空 public，
// 让 @fastify/static 能正常注册（前端静态由 Vercel 直接托管）
if (!existsSync('/tmp/public')) {
  mkdirSync('/tmp/public', { recursive: true })
}
chdir('/tmp')

const { default: app } = await import('../apps/api/dist/server.js')

export default async function handler(req: any, res: any) {
  await app.ready()
  app.server.emit('request', req, res)
}
