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
import { computed, onMounted, ref, watch } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import { useAuthStore } from '@/stores/auth'
import { getSiteSettings, updateSiteSettings } from '@/api/admin'

const store = useSettingsStore()
const authStore = useAuthStore()

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
