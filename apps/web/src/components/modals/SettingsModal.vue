<template>
  <!-- 与账号 / 数据管理 / AI 一致的分区卡片外壳 -->
  <div class="prefs">
    <section class="prefs-card">
      <div class="prefs-card__body">
        <div class="launch">
          <div class="launch__copy">
            <div class="launch__title">启动页面</div>
            <div class="launch__hint">打开应用时默认进入</div>
          </div>
          <div class="seg" role="radiogroup" aria-label="启动页面">
            <button
              type="button"
              role="radio"
              class="seg__btn"
              :class="{ 'is-on': defaultHome === 'home' }"
              :aria-checked="defaultHome === 'home'"
              @click="defaultHome = 'home'"
            >
              首页
            </button>
            <button
              type="button"
              role="radio"
              class="seg__btn"
              :class="{ 'is-on': defaultHome === 'all' }"
              :aria-checked="defaultHome === 'all'"
              @click="defaultHome = 'all'"
            >
              全部
            </button>
          </div>
        </div>

        <div class="rule" role="separator" />

        <div class="preference-row">
          <div class="launch__copy">
            <div class="launch__title">小鸟飞行动效</div>
            <div class="launch__hint">控制打开和关闭面板时的小鸟动画</div>
          </div>
          <button
            type="button"
            role="switch"
            class="switch"
            :class="{ 'is-on': aiAnimationEnabled }"
            :aria-checked="aiAnimationEnabled"
            @click="toggleAIAnimation"
          >
            <span class="switch__thumb" />
            <span class="sr-only">{{ aiAnimationEnabled ? '已开启' : '已关闭' }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- 站点管理（仅管理员可见） -->
    <section v-if="showSiteAdmin" class="prefs-card">
      <div class="prefs-card__body">
        <div class="preference-row">
          <div class="launch__copy">
            <div class="launch__title">
              允许新用户注册
              <span v-if="regSaving" class="reg-status">保存中…</span>
              <span v-else-if="regError" class="reg-status reg-status--err">{{ regError }}</span>
            </div>
            <div class="launch__hint">
              开启后，访客可在登录页注册新账号；关闭则只有已有账号能登录
            </div>
          </div>
          <button
            type="button"
            role="switch"
            class="switch"
            :class="{ 'is-on': registrationEnabled }"
            :aria-checked="registrationEnabled"
            :disabled="regLoading"
            @click="toggleRegistration"
          >
            <span class="switch__thumb" />
            <span class="sr-only">{{ registrationEnabled ? '已开启' : '已关闭' }}</span>
          </button>
        </div>
      </div>
    </section>

    <!-- 图标管理（仅管理员可见） -->
    <section v-if="showSiteAdmin" class="prefs-card">
      <div class="prefs-card__body">
        <div class="preference-row">
          <div class="launch__copy">
            <div class="launch__title">
              刷新站点图标
              <span v-if="iconProgress" class="reg-status">{{ iconProgress }}</span>
              <span v-else-if="iconError" class="reg-status reg-status--err">{{ iconError }}</span>
            </div>
            <div class="launch__hint">
              目标网站更换图标后可重新抓取；过程约需一两分钟，请保持页面打开
            </div>
          </div>
          <button
            type="button"
            class="icon-refresh-btn"
            :disabled="iconRefreshing"
            title="刷新全部站点图标"
            @click="startIconRefresh"
          >
            <i class="fas fa-sync-alt" :class="{ 'fa-spin': iconRefreshing }" />
          </button>
        </div>
      </div>
    </section>
    <!-- 投稿审核（仅管理员可见） -->
    <section v-if="showSiteAdmin" class="prefs-card">
      <div class="prefs-card__body">
        <div class="preference-row">
          <div class="launch__copy">
            <div class="launch__title">
              访客投稿审核
              <span v-if="subPending > 0" class="reg-status">{{ subPending }} 条待审</span>
            </div>
            <div class="launch__hint">
              访客通过顶栏「推荐站点」提交;通过后自动加入所选分类并云同步
            </div>
          </div>
          <button
            type="button"
            class="icon-refresh-btn"
            :disabled="subLoading"
            title="刷新投稿列表"
            @click="loadSubmissions"
          >
            <i class="fas fa-sync-alt" :class="{ 'fa-spin': subLoading }" />
          </button>
        </div>

        <div v-if="subError" class="sub-error">{{ subError }}</div>
        <p v-else-if="submissions.length === 0" class="sub-empty">
          暂无投稿。访客推荐站点后会出现在这里。
        </p>

        <ul v-else class="sub-list">
          <li v-for="sub in submissions" :key="sub.id" class="sub-item" :class="`is-${sub.status}`">
            <div class="sub-item__main">
              <div class="sub-item__title">
                <span class="sub-item__name">{{ sub.name }}</span>
                <span
                  v-if="sub.status !== 'pending'"
                  class="sub-item__badge"
                  :class="`sub-item__badge--${sub.status}`"
                >
                  {{ sub.status === 'approved' ? '已通过' : '已拒绝' }}
                </span>
              </div>
              <a class="sub-item__url" :href="sub.url" target="_blank" rel="noopener noreferrer">
                {{ sub.url }}
              </a>
              <p v-if="sub.description" class="sub-item__desc">{{ sub.description }}</p>
              <p v-if="sub.contact" class="sub-item__contact">联系方式:{{ sub.contact }}</p>
            </div>
            <div v-if="sub.status === 'pending'" class="sub-item__actions">
              <select v-model="subTargetCategory[sub.id]" class="sub-category-select">
                <option v-for="c in publicCategories" :key="c.id" :value="c.id">
                  {{ c.name }}
                </option>
              </select>
              <button
                type="button"
                class="sub-btn sub-btn--approve"
                :disabled="subActing"
                @click="approveSubmission(sub)"
              >
                通过
              </button>
              <button
                type="button"
                class="sub-btn sub-btn--reject"
                :disabled="subActing"
                @click="rejectSubmission(sub)"
              >
                拒绝
              </button>
            </div>
          </li>
        </ul>
      </div>
    </section>
    <!-- 背景壁纸（毛玻璃模式） -->
    <section class="prefs-card">
      <div class="prefs-card__body">
        <div class="preference-row wallpaper-row">
          <div class="launch__copy">
            <div class="launch__title">背景壁纸</div>
            <div class="launch__hint">开启毛玻璃风格；仅保存在当前设备，不影响其他浏览器</div>
          </div>
          <div class="seg" role="radiogroup" aria-label="背景壁纸">
            <button
              type="button"
              role="radio"
              class="seg__btn"
              :class="{ 'is-on': wallpaperMode === 'none' }"
              :aria-checked="wallpaperMode === 'none'"
              @click="setWallpaperMode('none')"
            >
              关闭
            </button>
            <button
              type="button"
              role="radio"
              class="seg__btn"
              :class="{ 'is-on': wallpaperMode === 'bing' }"
              :aria-checked="wallpaperMode === 'bing'"
              @click="setWallpaperMode('bing')"
            >
              必应每日
            </button>
            <button
              type="button"
              role="radio"
              class="seg__btn"
              :class="{ 'is-on': wallpaperMode === 'url' }"
              :aria-checked="wallpaperMode === 'url'"
              @click="setWallpaperMode('url')"
            >
              自定义
            </button>
          </div>
        </div>

        <div v-if="wallpaperMode === 'url'" class="rule" role="separator" />
        <div v-if="wallpaperMode === 'url'" class="wallpaper-url-row">
          <input
            v-model="wallpaperUrlInput"
            type="url"
            class="wallpaper-url-input"
            placeholder="粘贴图片直链，例如 https://example.com/bg.jpg"
            @keydown.enter="applyWallpaperUrl"
          />
          <button
            type="button"
            class="wallpaper-url-btn"
            :disabled="!wallpaperUrlInput.trim()"
            @click="applyWallpaperUrl"
          >
            应用
          </button>
        </div>
        <p v-if="wallpaperError" class="wallpaper-error">{{ wallpaperError }}</p>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { useUIStore } from '@/stores/ui'
import { useWebsiteStore } from '@/stores/website'
import { useCategoryStore } from '@/stores/category'
import {
  getSiteSettings,
  updateSiteSettings,
  refreshIconsBatch,
  getSubmissions,
  reviewSubmission,
  type SiteSubmission
} from '@/api/admin'

const store = useSettingsStore()
const authStore = useAuthStore()
const uiStore = useUIStore()
const websiteStore = useWebsiteStore()
const categoryStore = useCategoryStore()

const current = store.settings.defaultHome
const validDefault = (['home', 'all'].includes(current || '') ? current : 'home') as 'home' | 'all'
const defaultHome = ref<'home' | 'all'>(validDefault)
const aiAnimationEnabled = ref(store.settings.aiAnimationEnabled !== false)

watch(defaultHome, val => {
  if (val) {
    store.setDefaultHome(val)
    if (authStore.isAuthenticated) void store.saveRemotePreferences(authStore.user?.id)
  }
})

const toggleAIAnimation = () => {
  aiAnimationEnabled.value = !aiAnimationEnabled.value
  store.updateSettings({ aiAnimationEnabled: aiAnimationEnabled.value })
  if (authStore.isAuthenticated) void store.saveRemotePreferences(authStore.user?.id)
}

// ── 背景壁纸 ─────────────────────────────────
const wallpaperMode = computed(() => store.settings.wallpaperMode || 'none')
const wallpaperUrlInput = ref('')
const wallpaperError = ref('')

const setWallpaperMode = (mode: 'none' | 'bing' | 'url') => {
  wallpaperError.value = ''
  if (mode === 'url') {
    wallpaperUrlInput.value = store.settings.wallpaperUrl || ''
    // 若已有保存过的地址，直接沿用；否则等用户点「应用」。
    if (store.settings.wallpaperUrl) {
      store.updateSettings({ wallpaperMode: 'url' })
    } else {
      store.updateSettings({ wallpaperMode: 'none', wallpaperUrl: '' })
    }
    return
  }
  store.updateSettings({ wallpaperMode: mode })
}

const applyWallpaperUrl = () => {
  const url = wallpaperUrlInput.value.trim()
  if (!url) return
  if (!/^https?:\/\/.+/i.test(url)) {
    wallpaperError.value = '请输入以 http(s):// 开头的图片地址'
    return
  }
  wallpaperError.value = ''
  store.updateSettings({ wallpaperMode: 'url', wallpaperUrl: url })
}

// ── 站点管理（仅管理员可见） ──────────────────
const showSiteAdmin = ref(false)
const registrationEnabled = ref(false)
const regLoading = ref(false)
const regSaving = ref(false)
const regError = ref('')

onMounted(async () => {
  if (!authStore.isAuthenticated) return
  regLoading.value = true
  try {
    const res = await getSiteSettings()
    if (res.success && res.data) {
      showSiteAdmin.value = true
      registrationEnabled.value = res.data.registrationEnabled
    }
  } catch {
    /* 非（或尚未刷新为）管理员：隐藏该区块 */
  } finally {
    regLoading.value = false
  }
})

// ── 访客投稿审核（仅管理员可见） ─────────────
const submissions = ref<SiteSubmission[]>([])
const subPending = ref(0)
const subLoading = ref(false)
const subError = ref('')
const subActing = ref(false)
const subTargetCategory = reactive<Record<string, string>>({})

const publicCategories = computed(() => categoryStore.categories)

const loadSubmissions = async () => {
  subLoading.value = true
  subError.value = ''
  try {
    const res = await getSubmissions()
    if (res.success && res.data) {
      submissions.value = res.data.submissions
      subPending.value = res.data.pending
      // 默认目标分类:第一个分类
      for (const s of submissions.value) {
        if (!subTargetCategory[s.id]) {
          subTargetCategory[s.id] = categoryStore.categories[0]?.id || ''
        }
      }
    } else {
      subError.value = '投稿列表加载失败'
    }
  } catch {
    subError.value = '投稿列表加载失败,请稍后重试'
  } finally {
    subLoading.value = false
  }
}

watch(showSiteAdmin, open => {
  if (open) void loadSubmissions()
})

const approveSubmission = async (sub: SiteSubmission) => {
  if (subActing.value) return
  const categoryId = subTargetCategory[sub.id]
  if (!categoryId) {
    uiStore.showToast('请先选择一个分类', 'warning')
    return
  }
  subActing.value = true
  try {
    await reviewSubmission(sub.id, 'approve')
    // 通过即入库:加入所选分类(登录状态下会自动云同步)
    const now = new Date()
    await websiteStore.addWebsite({
      name: sub.name,
      url: sub.url,
      description: sub.description || '',
      categoryId,
      tagIds: [],
      createdAt: now,
      updatedAt: now,
      visitCount: 0,
      isOnline: true,
      isFavorite: false
    })
    uiStore.showToast(`已通过「${sub.name}」并加入导航`, 'success')
    await loadSubmissions()
  } catch {
    uiStore.showToast('操作失败,请重试', 'error')
  } finally {
    subActing.value = false
  }
}

const rejectSubmission = async (sub: SiteSubmission) => {
  if (subActing.value) return
  subActing.value = true
  try {
    await reviewSubmission(sub.id, 'reject')
    uiStore.showToast(`已拒绝「${sub.name}」`, 'info')
    await loadSubmissions()
  } catch {
    uiStore.showToast('操作失败,请重试', 'error')
  } finally {
    subActing.value = false
  }
}

const toggleRegistration = async () => {
  if (regSaving.value) return
  const next = !registrationEnabled.value
  regSaving.value = true
  regError.value = ''
  try {
    const res = await updateSiteSettings({ registrationEnabled: next })
    if (res.success && res.data) {
      registrationEnabled.value = res.data.registrationEnabled
    } else {
      regError.value = res.message || '保存失败，请重试'
    }
  } catch {
    regError.value = '保存失败，请检查网络'
  } finally {
    regSaving.value = false
  }
}

// ── 图标批量刷新（仅管理员可见）：游标分批循环调用，避开 Workers 子请求限额 ──
const iconRefreshing = ref(false)
const iconProgress = ref('')
const iconError = ref('')

const startIconRefresh = async () => {
  if (iconRefreshing.value) return
  iconRefreshing.value = true
  iconError.value = ''
  let cursor = 0
  let totalUpdated = 0
  let totalFailed = 0
  try {
    for (;;) {
      const res = await refreshIconsBatch(cursor)
      if (!res.success || !res.data) {
        throw new Error(res.message || '刷新失败')
      }
      const d = res.data
      totalUpdated += d.updated
      totalFailed += d.failed
      iconProgress.value = d.done ? `完成：更新 ${totalUpdated} 个` : `${d.nextCursor}/${d.total}…`
      cursor = d.nextCursor
      if (d.done) break
    }
    if (totalUpdated > 0) {
      uiStore.showToast(`图标刷新完成，更新 ${totalUpdated} 个`, 'success')
      window.location.reload()
    } else {
      uiStore.showToast('图标已是最新的', 'success')
    }
  } catch (err) {
    iconError.value = err instanceof Error ? err.message : '刷新失败，请重试'
  } finally {
    iconRefreshing.value = false
    setTimeout(() => {
      iconProgress.value = ''
    }, 4000)
  }
}
</script>

<style scoped lang="scss">
.prefs {
  width: 100%;
  max-width: 820px;
}

.prefs-card {
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 16px;
  background: transparent;
  overflow: hidden;
  box-shadow: none;
}

.prefs-card + .prefs-card {
  margin-top: 14px;
}

.reg-status {
  margin-left: 8px;
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);

  &--err {
    color: #ef4444;
  }
}

.icon-refresh-btn {
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.1));
  background: var(--bg-tile);
  color: var(--text-secondary);
  font-size: 15px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: var(--primary-soft);
    color: var(--color-primary-dark);
  }

  &:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
}

/* 投稿审核列表 */
.sub-error,
.sub-empty {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-muted);
}

.sub-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: grid;
  gap: 10px;
  max-height: 320px;
  overflow-y: auto;
}

.sub-item {
  padding: 10px 12px;
  border: 1px solid var(--border-tile);
  border-radius: 12px;
  background: var(--bg-tile);
  display: flex;
  gap: 10px;
  align-items: flex-start;

  &.is-rejected {
    opacity: 0.55;
  }
}

.sub-item__main {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 3px;
}

.sub-item__title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sub-item__name {
  font-size: 14px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-main);
}

.sub-item__badge {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  font-weight: 600;

  &--approved {
    color: #15803d;
    background: rgba(34, 197, 94, 0.14);
  }

  &--rejected {
    color: #b91c1c;
    background: rgba(239, 68, 68, 0.14);
  }
}

.sub-item__url {
  font-size: 12px;
  color: var(--color-primary);
  text-decoration: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
}

.sub-item__desc,
.sub-item__contact {
  margin: 0;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}

.sub-item__actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 0 0 auto;
}

.sub-category-select {
  font: inherit;
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 8px;
  border: 1px solid var(--border-tile);
  background: var(--bg-panel);
  color: var(--text-main);
  max-width: 130px;
}

.sub-btn {
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 4px 12px;
  border-radius: 8px;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &--approve {
    background: var(--color-primary);
    color: #fff;
  }

  &--reject {
    background: transparent;
    color: var(--color-error);
    border: 1px solid color-mix(in srgb, var(--color-error) 40%, transparent);
  }
}

.wallpaper-row {
  flex-wrap: wrap;
}

.wallpaper-url-row {
  display: flex;
  gap: 10px;
}

.wallpaper-url-input {
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 12px;
  border: 1px solid rgba(148, 163, 184, 0.35);
  border-radius: 9px;
  background: var(--bg-tile);
  color: var(--text-main);
  font-size: 13px;
  font-family: inherit;

  &:focus {
    outline: none;
    border-color: var(--color-primary);
  }
}

.wallpaper-url-btn {
  flex-shrink: 0;
  height: 36px;
  padding: 0 18px;
  border: none;
  border-radius: 9px;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.15s ease;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.wallpaper-error {
  margin-top: 8px;
  color: #ef4444;
  font-size: 12px;
}

.prefs-card__body {
  padding: 20px;
  display: flex;
  flex-direction: column;
}

.rule {
  height: 1px;
  background: rgba(148, 163, 184, 0.14);
  margin: 18px 0;
}

/* ——— 通用行（与账号/数据管理一致的横排布局） ——— */
.launch,
.preference-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.launch__copy {
  min-width: 0;
}

.launch__title {
  color: var(--text-main);
  font-size: 14px;
  font-weight: 600;
}

.launch__hint {
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.5;
}

/* ——— 分段选择（启动页面） ——— */
.seg {
  display: inline-flex;
  padding: 3px;
  border-radius: 9px;
  background: rgba(148, 163, 184, 0.12);
  gap: 2px;
  flex-shrink: 0;
}

.seg__btn {
  border: none;
  background: transparent;
  padding: 6px 16px;
  border-radius: 7px;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;

  &:hover {
    color: var(--text-main);
  }

  &.is-on {
    background: var(--bg-panel, #fff);
    color: var(--text-main);
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
  }
}

/* ——— 开关（小鸟动效） ——— */
.switch {
  position: relative;
  width: 42px;
  height: 24px;
  border-radius: 999px;
  border: none;
  background: rgba(148, 163, 184, 0.4);
  cursor: pointer;
  transition: background 0.2s ease;
  flex-shrink: 0;

  &.is-on {
    background: var(--color-primary);
  }
}

.switch__thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.2);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);

  .is-on & {
    transform: translateX(18px);
  }
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
</style>
