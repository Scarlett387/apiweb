// @ts-ignore
import * as serverModule from './server.js'

export default {
  async fetch(request: Request, env: Record<string, any>) {
    // 注入环境变量，兼容原业务代码读取方式
    Object.assign(process.env, env)

    // 自动匹配常见 Fastify 项目导出格式：app / server / default / 工厂函数
    let fastifyInstance: any
    if (serverModule.default) fastifyInstance = serverModule.default
    else if (serverModule.app) fastifyInstance = serverModule.app
    else if (serverModule.server) fastifyInstance = serverModule.server
    else if (typeof serverModule === 'function') fastifyInstance = await serverModule()
    else fastifyInstance = Object.values(serverModule)[0]

    await fastifyInstance.ready()

    // 处理请求体
    let body: string | undefined
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try { body = await request.text() } catch { body = undefined }
    }

    // 调用 Fastify 原生注入能力处理请求
    const res = await fastifyInstance.inject({
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers),
      payload: body
    })

    // 转换为 Workers 标准响应
    return new Response(res.payload, {
      status: res.statusCode,
      headers: res.headers as Record<string, string>
    })
  }
}
