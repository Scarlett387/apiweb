/**
 * 公开 blob 读取端点（无鉴权，浏览器直接加载图标等静态资源）。
 *
 * 仅在 Workers + D1 存储模式下有效；配置了外部存储（R2/S3/WebDAV）时
 * 图标等资源走存储自带的公开 URL，本端点返回 404。
 */
import { FastifyPluginAsync } from 'fastify'
import { D1StorageClient } from '../lib/d1-storage.js'
import { dynamicPublicStorage } from '../services.js'

const storageRoutes: FastifyPluginAsync = async app => {
  app.get('/storage/blob/*', async (req, reply) => {
    const key = decodeURIComponent((req.params as Record<string, string>)['*'] || '')
    if (!key || key.includes('..')) {
      return reply
        .code(400)
        .send({ success: false, code: 'BAD_REQUEST', message: '无效的资源路径' })
    }

    const client = dynamicPublicStorage.getClient()
    if (!(client instanceof D1StorageClient)) {
      return reply.code(404).send({ success: false, code: 'NOT_FOUND', message: '资源不存在' })
    }

    const blob = await client.getBinary(key)
    if (!blob) {
      return reply.code(404).send({ success: false, code: 'NOT_FOUND', message: '资源不存在' })
    }

    return reply
      .header('content-type', blob.contentType)
      .header('cache-control', 'public, max-age=3600')
      .send(Buffer.from(blob.data))
  })
}

export default storageRoutes
