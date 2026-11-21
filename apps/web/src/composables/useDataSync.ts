import { watch, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useCloudSync } from '@/composables/useCloudSync'
import { useWebsiteStore } from '@/stores/website'
import { useCategoryStore } from '@/stores/category'
import { useTagStore } from '@/stores/tag'
import { useUIStore } from '@/stores/ui'
import { useAIStore } from '@/stores/ai'
import { useSettingsStore } from '@/stores/settings'
import { captureAccountSession, isCurrentAccountSession } from '@/utils/account-session'
import { request } from '@/utils/http'
import { logger } from '@nav/logger'

interface PublicNavPayload {
  websites: Record<string, unknown>[]
  categories: Record<string, unknown>[]
  tags: Record<string, unknown>[]
}

const SYNC_DEBOUNCE_MS = 2000
const SYNC_REFRESH_INTERVAL_MS = 60 * 1000

export function useDataSync() {
  const authStore = useAuthStore()
  const cloudSync = useCloudSync()
  const websiteStore = useWebsiteStore()
  const categoryStore = useCategoryStore()
  const tagStore = useTagStore()
  const uiStore = useUIStore()
  const aiStore = useAIStore()
  const settingsStore = useSettingsStore()
  // A cached user means this is a page refresh. Session verification and the
  // following workspace reconcile can run without blocking the already
  // hydrated local workspace with a global loading overlay.
  const startupUserId = authStore.user?.id || null
  let startupSessionPending = true
  let activeSessionUserId: string | null | undefined
  let syncTimer: number | null = null
  let refreshTimer: number | null = null
  let localSyncInFlight = false

  // 访客/本地模式：拉取站主公开分享的导航数据，与本地已有数据合并展示。
  // 合并规则：按 id 去重，同 id 以云端为准（保证站主更新可见），
  // 本地新增（id 不在云端）的条目全部保留——本地数据仅存浏览器，不上云。
  // 失败静默——不打扰浏览。
  let visitorHydrated = false
  const mergeById = <T extends { id: string }>(remote: T[], local: readonly T[]): T[] => {
    const map = new Map<string, T>()
    for (const item of local) map.set(item.id, item)
    for (const item of remote) map.set(item.id, item) // 云端同 id 覆盖本地
    return [...map.values()]
  }
  const hydrateVisitorData = async () => {
    if (visitorHydrated) return
    visitorHydrated = true
    try {
      const res = await request.get<{ data: PublicNavPayload }>('/api/public/nav')
      if (res?.success && res.data) {
        const { websites, categories, tags } = res.data
        if (Array.isArray(websites)) {
          websiteStore.overwriteWebsites(
            mergeById(
              websites as { id: string }[],
              websiteStore.websites as unknown as { id: string }[]
            ) as never[]
          )
        }
        if (Array.isArray(categories)) {
          categoryStore.overwriteCategories(
            mergeById(
              categories as { id: string }[],
              categoryStore.categories as unknown as { id: string }[]
            ) as never[]
          )
        }
        if (Array.isArray(tags)) {
          tagStore.overwriteTags(
            mergeById(
              tags as { id: string }[],
              tagStore.tags as unknown as { id: string }[]
            ) as never[]
          )
        }
      }
    } catch (err) {
      logger.warn(
        `[Visitor] 公开导航数据加载失败: ${err instanceof Error ? err.message : String(err)}`
      )
      visitorHydrated = false // 允许下次会话检查时重试
    }
  }

  const showBookmarkImportOnboarding = (userId: string) => {
    if (websiteStore.websites.length > 0) return
    if (uiStore.modalState.syncConflict || uiStore.modalState.syncRecovery) return

    const promptKey = `navData:user:${encodeURIComponent(userId)}:bookmarkImportPromptSeen`
    try {
      if (localStorage.getItem(promptKey) === 'true') return
      localStorage.setItem(promptKey, 'true')
    } catch {
      // The import entry remains available from data management when storage is unavailable.
    }
    uiStore.openModal('accountPanel', { tab: 'data' })
  }

  const flushLocalChanges = async () => {
    if (localSyncInFlight) return
    localSyncInFlight = true
    try {
      await cloudSync.syncLocalChanges()
    } finally {
      localSyncInFlight = false
    }
  }

  const scheduleSync = () => {
    if (syncTimer) window.clearTimeout(syncTimer)
    syncTimer = window.setTimeout(() => {
      syncTimer = null
      void flushLocalChanges()
    }, SYNC_DEBOUNCE_MS)
  }

  const initSync = () => {
    watch(
      [
        () => authStore.hasCheckedSession,
        // Keep the cached user id while the cookie session is being verified. OAuth binding
        // callbacks run during this window and must stay in the same account session.
        () => authStore.user?.id || null
      ],
      ([hasCheckedSession, userId]) => {
        if (syncTimer) {
          window.clearTimeout(syncTimer)
          syncTimer = null
        }

        // Session verification changes hasCheckedSession for the same user. Reset only when
        // the actual account id changes, otherwise in-flight OAuth binding is aborted after
        // the server has already completed it and the callback incorrectly reports failure.
        if (activeSessionUserId !== userId) {
          activeSessionUserId = userId
          cloudSync.resetSession(userId)
          uiStore.closeAllModals()
          aiStore.clearState()
        }

        if (!hasCheckedSession) {
          // Verify the httpOnly session silently on startup. The local
          // workspace was initialized before mount and remains usable while
          // the server confirms the cached account.
          uiStore.setLoading(false)
          return
        }

        const isStartupRefresh = startupSessionPending && userId === startupUserId
        startupSessionPending = false
        settingsStore.activateAccountPreferences(userId)

        if (userId) {
          uiStore.setVisitorMode(false)
          const session = captureAccountSession()
          const shouldShowLoading = !isStartupRefresh
          if (shouldShowLoading) {
            uiStore.setLoading(true, '正在加载账号数据…')
          } else {
            uiStore.setLoading(false)
          }
          void cloudSync
            .activateWorkspace()
            .then(activated => {
              if (activated && isCurrentAccountSession(session)) {
                uiStore.setLoading(false)
                showBookmarkImportOnboarding(userId)
              }
            })
            .catch(error => {
              if (!isCurrentAccountSession(session)) return
              uiStore.setLoading(true, '账号数据加载失败，请刷新重试')
              uiStore.showToast(
                error instanceof Error ? error.message : '账号数据加载失败，请刷新重试',
                'error'
              )
            })
          return
        }
        // 未登录 → 访客模式：加载站主公开导航数据（只读浏览）
        uiStore.setVisitorMode(true)
        void hydrateVisitorData()
        uiStore.setLoading(false)
      },
      // Run before other watchers (e.g. auto-backup) react to the same login edge.
      { flush: 'sync', immediate: true }
    )

    watch(
      [
        () => websiteStore.dataRevision,
        () => categoryStore.dataRevision,
        () => tagStore.dataRevision
      ],
      () => {
        if (authStore.isAuthenticated && cloudSync.isEnabled.value) scheduleSync()
      }
    )

    const reconcileWhenVisible = () => {
      if (syncTimer) {
        window.clearTimeout(syncTimer)
        syncTimer = null
        void flushLocalChanges()
        return
      }

      if (
        !localSyncInFlight &&
        document.visibilityState === 'visible' &&
        authStore.isAuthenticated &&
        cloudSync.isEnabled.value
      ) {
        void cloudSync.checkOnLogin().catch(() => undefined)
      }
    }

    document.addEventListener('visibilitychange', reconcileWhenVisible)
    refreshTimer = window.setInterval(reconcileWhenVisible, SYNC_REFRESH_INTERVAL_MS)

    onUnmounted(() => {
      if (syncTimer) window.clearTimeout(syncTimer)
      if (refreshTimer) window.clearInterval(refreshTimer)
      document.removeEventListener('visibilitychange', reconcileWhenVisible)
    })
  }

  return {
    initSync
  }
}
