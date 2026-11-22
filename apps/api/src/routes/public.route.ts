/**
 * 公开导航数据端点（无鉴权，只读）。
 *
 * 用途：单用户导航站模式下，让访客无需登录即可浏览站主的导航数据。
 * 返回 user_sync_state 中最近活跃用户（站主）的云端快照 data 部分。
 * 只读且不含任何用户凭据；站点关闭注册时访客仍可访问本端点。
 */
import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { databaseClient, navCommunityService } from '../services.js'

interface SyncStateRecord {
  user_id: string
  current_storage_key: string | null
}

interface BlobRow {
  content: string
}

const publicRoutes: FastifyPluginAsyncZod = async app => {
  // ── 必应每日一图代理 ──────────────────────────────
  // 服务端转发 www.bing.com HPImageArchive，避免浏览器直连的 CORS/网络问题。
  // 结果内存缓存 1 小时（必应每天只换一张图）。
  let bingCache: { url: string; fetchedAt: number } | null = null

  app.get('/public/bing', async (_req, reply) => {
    if (bingCache && Date.now() - bingCache.fetchedAt < 3600_000) {
      return reply.header('cache-control', 'public, max-age=600').send({
        success: true,
        data: { url: bingCache.url }
      })
    }
    try {
      const res = await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1', {
        headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      })
      if (!res.ok) throw new Error(`bing responded ${res.status}`)
      const json = (await res.json()) as { images?: { url?: string }[] }
      const raw = json.images?.[0]?.url
      if (!raw) throw new Error('empty images')
      const url = raw.startsWith('http') ? raw : `https://www.bing.com${raw}`
      bingCache = { url, fetchedAt: Date.now() }
      return reply.header('cache-control', 'public, max-age=600').send({
        success: true,
        data: { url }
      })
    } catch (err) {
      _req.log.warn({ err }, 'Bing wallpaper fetch failed')
      return reply.code(502).send({
        success: false,
        code: 'BING_FETCH_FAILED',
        message: '获取必应每日图片失败'
      })
    }
  })

  // ── 站点统计 + 健康状态 ────────────────────────────────────────────
  // 统计条(收录数/在线数)与卡片状态点共用,60s 缓存。
  app.get('/public/stats', async (_req, reply) => {
    try {
      const state = await databaseClient.first<SyncStateRecord>(
        `SELECT user_id, current_storage_key FROM user_sync_state
         WHERE enabled = 1 AND current_storage_key IS NOT NULL
         ORDER BY updated_at DESC LIMIT 1`
      )
      if (!state?.current_storage_key) {
        return reply.header('cache-control', 'public, max-age=60').send({
          success: true,
          data: { total: 0, online: 0, checkedAt: null, items: [] }
        })
      }
      const row = await databaseClient.first<BlobRow>(
        'SELECT content FROM storage_blobs WHERE key = ?',
        [state.current_storage_key]
      )
      if (!row) {
        return reply.header('cache-control', 'public, max-age=60').send({
          success: true,
          data: { total: 0, online: 0, checkedAt: null, items: [] }
        })
      }
      const snapshot = JSON.parse(row.content) as {
        data?: Record<string, Array<Record<string, unknown>>>
      }
      const websites = Array.isArray(snapshot.data?.websites) ? snapshot.data!.websites : []
      const urls = websites.map(w => String(w.url || '')).filter(Boolean)
      const health = await navCommunityService.getHealthByUrl(urls)
      // 分类级公开开关:隐匿分类的站不进公开统计
      const categories = Array.isArray(snapshot.data?.categories) ? snapshot.data!.categories : []
      const hiddenCategoryIds = new Set(
        categories.filter(c => c.isPublic === false).map(c => String(c.id))
      )
      const publicWebsites = websites.filter(w => !hiddenCategoryIds.has(String(w.categoryId)))
      const publicUrls = new Set(publicWebsites.map(w => String(w.url || '')))
      const items = publicWebsites
        .map(w => {
          const url = String(w.url || '')
          const h = health[url]
          return h ? { url, online: h.online, latencyMs: h.latencyMs } : null
        })
        .filter((x): x is { url: string; online: boolean; latencyMs: number | null } => !!x)
      const online = items.filter(i => i.online).length
      const checkedAt =
        items.length > 0
          ? Math.max(...items.map(i => health[String(i.url)]?.checkedAt ?? 0)) || null
          : null
      return reply.header('cache-control', 'public, max-age=60').send({
        success: true,
        data: {
          total: publicUrls.size,
          online,
          checkedAt,
          items
        }
      })
    } catch (err) {
      _req.log.warn({ err }, 'Public stats fetch failed')
      return reply.header('cache-control', 'public, max-age=60').send({
        success: true,
        data: { total: 0, online: 0, checkedAt: null, items: [] }
      })
    }
  })

  // ── 访客投稿 ──────────────────────────────────────────────────────
  const submitSchema = z.object({
    name: z.string().trim().min(1, '站点名称不能为空').max(100),
    url: z
      .string()
      .trim()
      .min(1, '网址不能为空')
      .max(2000)
      .refine(v => /^https?:\/\/.+/i.test(v), { message: '网址必须以 http(s):// 开头' }),
    description: z.string().trim().max(200).optional(),
    contact: z.string().trim().max(100).optional()
  })

  app.post('/public/submit', { schema: { body: submitSchema } }, async (req, reply) => {
    try {
      const { id } = await navCommunityService.addSubmission({
        name: req.body.name,
        url: req.body.url,
        description: req.body.description ?? null,
        contact: req.body.contact ?? null,
        ip: req.ip
      })
      req.log.info({ submissionId: id }, 'Visitor submitted site')
      return reply.send({ success: true, message: '投稿已提交,感谢推荐!' })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg === 'DUPLICATE_SUBMISSION') {
        return reply.code(409).send({
          success: false,
          code: 'DUPLICATE_SUBMISSION',
          message: '这个网址最近已经推荐过啦,请耐心等待站长审核'
        })
      }
      if (msg === 'RATE_LIMITED') {
        return reply.code(429).send({
          success: false,
          code: 'RATE_LIMITED',
          message: '投稿太频繁了,请稍后再试'
        })
      }
      req.log.warn({ err }, 'Visitor submission failed')
      return reply.code(500).send({
        success: false,
        code: 'INTERNAL_ERROR',
        message: '提交失败,请稍后重试'
      })
    }
  })

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

        // 分类级公开开关：isPublic === false 的分类及其下网站不对外
        const rawCategories = asArray(data.categories)
        const hiddenCategoryIds = new Set(
          rawCategories.filter(c => c.isPublic === false).map(c => String(c.id))
        )
        const categories =
          hiddenCategoryIds.size > 0
            ? rawCategories.filter(c => !hiddenCategoryIds.has(String(c.id)))
            : rawCategories
        const websites =
          hiddenCategoryIds.size > 0
            ? asArray(data.websites).filter(w => !hiddenCategoryIds.has(String(w.categoryId)))
            : asArray(data.websites)

        return reply.header('cache-control', 'public, max-age=60').send({
          success: true,
          data: {
            updatedAt: snapshot.meta?.createdAt,
            websites,
            categories,
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
