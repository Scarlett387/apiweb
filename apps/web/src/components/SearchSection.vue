<template>
  <div class="search-section">
    <!-- Search Header -->
    <div v-if="!hideSearch" class="search-header-wrapper">
      <SearchHeader v-model="searchKeyword" />
    </div>

    <div class="content-layout">
      <!-- Sidebar Filters -->
      <SidebarFilters
        v-if="showFilters"
        :tags="tags"
        :categories="categories"
        :selected-tags="selectedTags"
        :selected-category="selectedCategory"
        @toggle-tag="toggleTag"
        @select-category="selectCategory"
        @manage-tags="emit('manageTags')"
        @manage-categories="emit('manageCategories')"
        @reorder-categories="onReorderCategories"
      />

      <!-- Main Content -->
      <main class="main-content">
        <!-- 站点统计条:收录数/在线数 + 管理员一键检测 -->
        <div v-if="!searchKeyword" class="stats-bar" :class="{ 'is-loading': healthStore.loading }">
          <template v-if="healthStore.hasData">
            <span class="stats-item">
              <b>{{ healthStore.total }}</b>
              个站点
            </span>
            <span class="stats-dot" aria-hidden="true" />
            <span class="stats-item">
              <b>{{ healthStore.onlineCount }}</b>
              个在线
            </span>
            <span v-if="healthStore.checkedAt" class="stats-checked">
              检测于 {{ formatCheckedAgo(healthStore.checkedAt) }}
            </span>
          </template>
          <template v-else>
            <span class="stats-item">
              <b>{{ filteredWebsites.length }}</b>
              个站点
            </span>
          </template>
          <span class="stats-spacer" />
          <BaseButton
            v-if="isAdmin"
            variant="ghost"
            size="xs"
            shape="rounded"
            class="health-check-btn"
            :loading="healthChecking"
            :title="healthStore.hasData ? '重新检测全部站点可用性' : '检测全部站点可用性'"
            @click="runHealthCheck"
          >
            <i v-if="!healthChecking" class="fas fa-heart-pulse" />
            {{ healthChecking ? `检测中 ${healthProgressText}` : '健康检测' }}
          </BaseButton>
        </div>

        <!-- Selected Conditions Bar -->
        <ActiveFiltersBar
          v-if="hasActiveFilters"
          :selected-tags="selectedTags"
          :selected-category="selectedCategory"
          :tags="tags"
          :categories="categories"
          @toggle-tag="toggleTag"
          @select-category="selectCategory"
          @clear-all="clearAllFilters"
        />

        <!-- Search Results -->
        <div v-if="searchKeyword && !hideSearch" class="search-results-section">
          <div class="results-header">
            <h3>搜索结果</h3>
            <BaseButton
              variant="ghost"
              size="sm"
              shape="rounded"
              class="action-btn"
              @click="clearSearch"
            >
              <i class="fas fa-times" />
              清空搜索
            </BaseButton>
          </div>
          <div v-if="searchResults.length > 0" class="website-grid">
            <WebsiteCard
              v-for="site in searchResults"
              :key="site.id"
              :website="site"
              @visit="onVisit"
              @edit="emit('edit', site)"
              @delete="emit('delete', site.id)"
              @favorite-toggle="onFavoriteToggle"
            />
          </div>
          <EmptyState
            v-else
            type="no-results"
            :message="`未找到与“${searchKeyword}”相关的结果`"
            :show-action-button="false"
          />
        </div>

        <!-- Filtered Grid -->
        <div v-else>
          <GroupedWebsiteGrid :websites="filteredWebsites">
            <template #default="{ website }">
              <div
                class="website-draggable"
                draggable="true"
                @dragstart="onDragStart(website.id, $event)"
                @dragover="onDragOver(website.id, $event)"
                @drop="onDrop(website.id, $event)"
                @dragend="onDragEnd"
              >
                <WebsiteCard
                  :website="website"
                  @visit="onVisit"
                  @edit="emit('edit', website)"
                  @delete="emit('delete', website.id)"
                  @favorite-toggle="onFavoriteToggle"
                />
              </div>
            </template>

            <template #add-card>
              <div class="add-card" @click="onAddSite">
                <div class="add-card-content">
                  <div class="add-icon">
                    <i class="fas fa-plus" />
                  </div>
                  <span>添加网站</span>
                </div>
              </div>
            </template>
          </GroupedWebsiteGrid>
        </div>

        <EmptyState
          v-if="filteredWebsites.length === 0 && !searchKeyword && websiteStore.websites.length > 0"
          type="no-results"
          message="当前筛选下没有网站"
          description="试试调整分类或标签筛选条件。"
          :show-action-button="false"
          size="small"
        />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @component SearchSection
 * @description 网站搜索与过滤主组件
 * 包含搜索框、标签筛选、分类筛选以及网站列表展示
 * 集成了搜索逻辑、拖拽排序等功能
 *
 * @props fixedView - 固定视图模式 ('recent' | 'favorite' | 'all')
 * @props hideSearch - 是否隐藏搜索框
 *
 * @emits edit - 编辑网站
 * @emits delete - 删除网站
 * @emits addSite - 添加新网站
 * @emits manageTags - 打开标签管理
 * @emits manageCategories - 打开分类管理
 */
import { computed, onMounted, ref } from 'vue'
import WebsiteCard from '@/components/WebsiteCard.vue'
import InfiniteWebsiteGrid from '@/components/InfiniteWebsiteGrid.vue'
import GroupedWebsiteGrid from '@/components/GroupedWebsiteGrid.vue'
import { EmptyState, BaseButton } from '@nav/ui'
import { useWebsiteStore } from '@/stores/website'
import { useCategoryStore } from '@/stores/category'
import { useAuthStore } from '@/stores/auth'
import { useHealthStore } from '@/stores/health'
import { useWebsiteSearch } from '@/composables/useWebsiteSearch'
import { useWebsiteDrag } from '@/composables/useWebsiteDrag'
import { runHealthCheckBatch } from '@/api/admin'
import { useUIStore } from '@/stores/ui'
import type { Website } from '@/types'

// Sub-components
import SearchHeader from './search/SearchHeader.vue'
import SidebarFilters from './search/SidebarFilters.vue'
import ActiveFiltersBar from './search/ActiveFiltersBar.vue'

interface Props {
  fixedView?: 'recent' | 'favorite' | 'all'
  hideSearch?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  hideSearch: false
})

const emit = defineEmits(['edit', 'delete', 'addSite', 'manageTags', 'manageCategories'])

const websiteStore = useWebsiteStore()
const categoryStore = useCategoryStore()
const authStore = useAuthStore()
const healthStore = useHealthStore()
const uiStore = useUIStore()

const isAdmin = computed(() => authStore.user?.role === 'ADMIN')

// ── 健康检测(管理员):循环分批调用,全部完成后刷新统计 ──────────────
const healthChecking = ref(false)
const healthProgressText = ref('')

const formatCheckedAgo = (ts: number) => {
  const diff = Date.now() - ts
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return `${Math.floor(diff / 86400_000)} 天前`
}

const runHealthCheck = async () => {
  if (healthChecking.value) return
  healthChecking.value = true
  try {
    let cursor = 0
    let done = false
    while (!done) {
      const res = await runHealthCheckBatch(cursor)
      if (!res.success || !res.data) throw new Error(res.message || '检测失败')
      done = res.data.done
      cursor = res.data.nextCursor
      healthProgressText.value = `${cursor}/${res.data.total}`
    }
    await healthStore.fetchStats()
    uiStore.showToast('健康检测完成', 'success')
  } catch {
    uiStore.showToast('健康检测失败,请稍后重试', 'error')
  } finally {
    healthChecking.value = false
    healthProgressText.value = ''
  }
}

onMounted(() => {
  void healthStore.fetchStats()
})

// 使用组合式函数
const {
  searchKeyword,
  selectedTags,
  selectedCategory,
  showFilters,
  tags,
  categories,
  filteredWebsites,
  searchResults,
  toggleTag,
  selectCategory,
  clearSearch,
  clearSelectedTags
} = useWebsiteSearch(() => props.fixedView)

const { onDragStart, onDragOver, onDrop, onDragEnd } = useWebsiteDrag(() => props.fixedView)

const hasActiveFilters = computed(() => {
  return selectedTags.value.length > 0 || selectedCategory.value !== 'all'
})

const clearAllFilters = () => {
  selectCategory('all')
  clearSelectedTags()
}

const onAddSite = () => {
  const contextCategoryId = selectedCategory.value !== 'all' ? selectedCategory.value : ''
  emit('addSite', contextCategoryId)
}

const onVisit = (website: Website) => {
  websiteStore.incrementVisitCount(website.id)
  window.open(website.url, '_blank', 'noopener,noreferrer')
}

// 侧栏分类拖动排序：按新顺序回写 store（登录后自动云同步；本地模式存浏览器）
const onReorderCategories = (newOrderIds: string[]) => {
  categoryStore.reorderCategories(newOrderIds)
}

const onFavoriteToggle = (websiteId: string) => {
  const w = websiteStore.websites.find(x => x.id === websiteId)
  if (!w) return
  websiteStore.updateWebsite(websiteId, { isFavorite: !w.isFavorite })
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;
@use '@/styles/mixins' as *;

.search-section {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.search-header-wrapper {
  margin-bottom: 0.5rem;
}

.content-layout {
  display: flex;
  gap: 1.5rem;
  align-items: flex-start;
}

/* Main Content Styles */
.main-content {
  flex: 1;
  min-width: 0;
}

/* 站点统计条 */
.stats-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 14px;
  margin-bottom: 14px;
  border: 1px solid var(--border-tile);
  border-radius: 12px;
  background: var(--bg-panel);
  font-size: 13px;
  color: var(--text-secondary);
}

.stats-item b {
  color: var(--text-main);
  font-weight: var(--font-weight-bold);
}

.stats-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--text-muted);
}

.stats-checked {
  color: var(--text-muted);
  font-size: 12px;
}

.stats-spacer {
  flex: 1;
}

.health-check-btn {
  flex: 0 0 auto;
}

.search-results-section {
  margin-top: 1.5rem;
}

.results-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;

  h3 {
    font-size: var(--font-size-lg);
    font-weight: var(--font-weight-semibold);
    color: var(--text-main);
  }
}

.website-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.25rem;
}

.website-draggable {
  cursor: grab;
  min-width: 0; /* Critical for grid/flex overflow */
  width: 100%;

  &:active {
    cursor: grabbing;
  }
}

.add-card {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 160px;
  background-color: var(--bg-panel);
  border: 1px dashed var(--border-tile);
  border-radius: 16px;
  cursor: pointer;
  transition: all 0.2s;

  &:hover {
    border-color: var(--color-primary);
    background-color: color-mix(in srgb, var(--color-primary) 2%, transparent);

    .add-icon {
      background-color: var(--color-primary);
      color: var(--color-white);
      transform: scale(1.1);
    }

    span {
      color: var(--color-primary);
    }
  }
}

.add-card-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;

  span {
    font-size: 14px;
    font-weight: 500;
    color: var(--text-secondary);
    transition: color 0.2s;
  }
}

.add-icon {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background-color: var(--bg-body);
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  transition: all 0.2s;
}

@include mobile {
  .search-section {
    gap: 1rem;
  }

  .content-layout {
    flex-direction: column;
    gap: 1rem;

    // 纵向排列下取消 flex-start，让内容区恢复满宽（否则卡片缩成内容宽度）
    align-items: stretch;
  }

  /* Sidebar becomes a horizontal scrollable bar on mobile */
  :deep(.sidebar-filters) {
    width: 100%;
    position: static;
    max-height: none;
    padding: 0;
    background: transparent;
    gap: 1rem;
    overflow: visible;
  }

  :deep(.filter-group) {
    background-color: var(--bg-panel);
    padding: 1rem;
    border-radius: 12px;
  }

  :deep(.tag-list),
  :deep(.category-list) {
    flex-flow: row nowrap;
    overflow-x: auto;
    padding-bottom: 4px;
    -webkit-overflow-scrolling: touch;
    align-items: center; /* Prevent items from stretching vertically */

    /* Hide scrollbar */
    scrollbar-width: none;
    &::-webkit-scrollbar {
      display: none;
    }
  }

  :deep(.choice-chip) {
    white-space: nowrap;
    flex: 0 0 auto;
  }

  :deep(.category-item) {
    white-space: nowrap;
    flex-shrink: 0;
    background-color: var(--bg-tile);
    border: none;
    border-radius: var(--radius-md);
    padding: 6px 12px;
    font-size: 12px;

    &.active {
      background-color: var(--primary-soft);
      color: var(--color-primary-dark);
      box-shadow: none;
    }
  }

  .website-grid {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .add-card {
    min-height: 120px;
    flex-direction: row;
    gap: 1rem;

    .add-icon {
      width: 48px;
      height: 48px;
      font-size: 20px;
    }

    span {
      font-size: 14px;
    }
  }
}
</style>
