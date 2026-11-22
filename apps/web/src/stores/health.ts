import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface SiteHealth {
  online: boolean
  latencyMs: number | null
}

interface PublicStatsPayload {
  total: number
  online: number
  checkedAt: number | null
  items: Array<{ url: string; online: boolean; latencyMs: number | null }>
}

/**
 * 站点健康状态:数据来自 /api/public/stats(管理员检测后落库,60s 缓存)。
 * 统计条与卡片状态点共用,任何用户(含访客)可读。
 */
export const useHealthStore = defineStore('health', () => {
  const total = ref(0)
  const onlineCount = ref(0)
  const checkedAt = ref<number | null>(null)
  const byUrl = ref<Record<string, SiteHealth>>({})
  const loaded = ref(false)
  const loading = ref(false)

  const fetchStats = async () => {
    if (loading.value) return
    loading.value = true
    try {
      const res = await fetch('/api/public/stats')
      const json = (await res.json()) as { success?: boolean; data?: PublicStatsPayload }
      if (json.success && json.data) {
        total.value = json.data.total
        onlineCount.value = json.data.online
        checkedAt.value = json.data.checkedAt
        const map: Record<string, SiteHealth> = {}
        for (const item of json.data.items) {
          map[item.url] = { online: item.online, latencyMs: item.latencyMs }
        }
        byUrl.value = map
        loaded.value = true
      }
    } catch {
      // 静默失败:统计条缺数据不阻塞浏览
    } finally {
      loading.value = false
    }
  }

  const getHealth = (url: string): SiteHealth | undefined => byUrl.value[url]

  const hasData = computed(() => loaded.value && checkedAt.value != null)

  return {
    total,
    onlineCount,
    checkedAt,
    byUrl,
    loaded,
    loading,
    hasData,
    fetchStats,
    getHealth
  }
})
