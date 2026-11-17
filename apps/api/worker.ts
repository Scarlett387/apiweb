import * as serverModule from './server.js'

// 兼容原项目的导出格式（命名导出/默认导出都能匹配）
const fastify = serverModule.fastify || serverModule.default

export default {
  async fetch(request: Request, env: Record<string, any>) {
    // 将环境变量注入，完全兼容原业务代码的读取方式
    Object.assign(process.env, env)
    await fastify.ready()

    // 处理请求体
    let body: string | undefined
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try { body = await request.text() } catch { body = undefined }
    }

    // 调用 Fastify 原生能力处理请求
    const res = await fastify.inject({
      method: request.method,
      url: request.url,
      headers: Object.fromEntries(request.headers),
      payload: body
    })

    // 转换为 Workers 标准响应格式
    return new Response(res.payload, {
      status: res.statusCode,
      headers: res.headers as Record<string, string>
    })
  }
}
