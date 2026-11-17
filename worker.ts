// @ts-ignore
import * as serverModule from './apps/api/server.js'

export default {
  async fetch(request: Request, env: Record<string, any>) {
    Object.assign(process.env, env)

    // 自动匹配原项目的导出格式
    const app = serverModule.default 
      || serverModule.app 
      || serverModule.server 
      || Object.values(serverModule)[0]
    
    await app.ready()

    // 处理请求体
    let body: string | undefined
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try { body = await request.text() } catch { body = undefined }
    }

    // 交给 Fastify 处理请求
    const res = await app.inject({
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers),
      payload: body
    })

    // 转成 Workers 标准响应
    return new Response(res.payload, {
      status: res.statusCode,
      headers: res.headers as Record<string, string>
    })
  }
}
