/**
 * 公开导航数据端点（无鉴权，只读）。
 *
 * 用途：单用户导航站模式下，让访客无需登录即可浏览站主的导航数据。
 * 返回 user_sync_state 中最近活跃用户（站主）的云端快照 data 部分。
 * 只读且不含任何用户凭据；站点关闭注册时访客仍可访问本端点。
 */
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { databaseClient } from '../services.js'

interface SyncStateRecord {
  user_id: string
  current_storage_key: string | null
}

interface BlobRow {
  content: string
}

const publicRoutes: FastifyPluginAsyncZod = async app => {
  app.get(
    '/public/nav',
    {
      schema: {
        response: {
          200: z.object({
            success: z.boolean(),
            data: z.object({
              updatedAt: z.string().optional(),
              websites: z.array(z.record(z.string(), z.unknown())),
              categories: z.array(z.record(z.string(), z.unknown())),
              tags: z.array(z.record(z.string(), z.unknown()))
            })
          }),
          404: z.object({ success: z.boolean(), code: z.string(), message: z.string() }),
          500: z.object({ success: z.boolean(), code: z.string(), message: z.string() })
        }
      }
    },
    async (req, reply) => {
      try {
        const state = await databaseClient.first<SyncStateRecord>(
          `SELECT user_id, current_storage_key FROM user_sync_state
           WHERE enabled = 1 AND current_storage_key IS NOT NULL
           ORDER BY updated_at DESC LIMIT 1`
        )
        if (!state?.current_storage_key) {
          return reply.code(404).send({
            success: false,
            code: 'NO_PUBLIC_DATA',
            message: '站主尚未发布导航数据'
          })
        }

        const row = await databaseClient.first<BlobRow>(
          'SELECT content FROM storage_blobs WHERE key = ?',
          [state.current_storage_key]
        )
        if (!row) {
          return reply.code(404).send({
            success: false,
            code: 'NO_PUBLIC_DATA',
            message: '站主尚未发布导航数据'
          })
        }

        const snapshot = JSON.parse(row.content) as {
          meta?: { createdAt?: string }
          data?: Record<string, unknown[]>
        }
        const data = snapshot.data || {}
        const asArray = (v: unknown): Record<string, unknown>[] =>
          Array.isArray(v) ? (v as Record<string, unknown>[]) : []

        return reply.header('cache-control', 'public, max-age=60').send({
          success: true,
          data: {
            updatedAt: snapshot.meta?.createdAt,
            websites: asArray(data.websites),
            categories: asArray(data.categories),
            tags: asArray(data.tags)
          }
        })
      } catch (err) {
        req.log.error({ err }, 'Public nav fetch failed')
        return reply.code(500).send({
          success: false,
          code: 'INTERNAL_ERROR',
          message: '获取导航数据失败，请稍后重试'
        })
      }
    }
  )
}

export default publicRoutes
