<!--
  分组折叠网站网格
  按「分类顺序」把站点分成若干组,每组标题可点击折叠/展开。
  折叠状态存 localStorage,刷新后保留。
-->
<template>
  <div class="grouped-grid">
    <section
      v-for="group in groups"
      :key="group.id"
      class="group-section"
      :class="{ 'is-collapsed': collapsed.has(group.id) }"
    >
      <button
        type="button"
        class="group-header"
        :aria-expanded="!collapsed.has(group.id)"
        @click="toggleGroup(group.id)"
      >
        <i
          class="fas group-chevron"
          :class="collapsed.has(group.id) ? 'fa-chevron-right' : 'fa-chevron-down'"
          aria-hidden="true"
        />
        <span class="group-name">{{ group.name }}</span>
        <span class="group-count">{{ group.websites.length }}</span>
        <span class="group-spacer" />
      </button>

      <div v-if="!collapsed.has(group.id)" class="website-grid">
        <slot v-for="website in group.websites" :key="website.id" :website="website" />
        <!-- 「添加网站」卡片固定在最后一个组的末尾 -->
        <slot v-if="group.isLast" name="add-card" />
      </div>
    </section>

    <!-- 全部分组都折叠后仍给一个添加入口 -->
    <slot v-if="groups.length > 0 && groups.every(g => collapsed.has(g.id))" name="add-card" />
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { useCategoryStore } from '@/stores/category'
import type { Website } from '@/types'

interface Props {
  websites: Website[]
}

const props = defineProps<Props>()
const categoryStore = useCategoryStore()

const STORAGE_KEY = 'navData:collapsedGroups'

const collapsed = reactive(new Set<string>())

// 初始化:恢复上次会话的折叠状态
try {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved) {
    for (const id of JSON.parse(saved) as string[]) collapsed.add(id)
  }
} catch {
  /* 损坏则忽略 */
}

const toggleGroup = (id: string) => {
  if (collapsed.has(id)) {
    collapsed.delete(id)
  } else {
    collapsed.add(id)
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]))
  } catch {
    /* 存不上不影响使用 */
  }
}

interface Group {
  id: string
  name: string
  icon?: string
  websites: Website[]
  isLast: boolean
}

const groups = computed<Group[]>(() => {
  const ordered = [...categoryStore.categories].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  const byCategory = new Map<string, Website[]>()
  const uncategorized: Website[] = []
  for (const w of props.websites) {
    const catId = w.categoryId || ''
    if (!catId || !categoryStore.categories.some(c => c.id === catId)) {
      uncategorized.push(w)
    } else {
      const list = byCategory.get(catId) || []
      list.push(w)
      byCategory.set(catId, list)
    }
  }
  const result: Group[] = []
  for (const c of ordered) {
    const list = byCategory.get(c.id)
    if (list && list.length > 0) {
      result.push({ id: c.id, name: c.name, icon: c.icon, websites: list, isLast: false })
    }
  }
  if (uncategorized.length > 0) {
    result.push({
      id: '__uncategorized__',
      name: '未分类',
      websites: uncategorized,
      isLast: false
    })
  }
  if (result.length > 0) result[result.length - 1].isLast = true
  return result
})

// 分类重命名等场景下同步数据即可;折叠集合本身无需响应
watch(
  () => props.websites,
  () => {
    /* groups 为 computed,自动响应 */
  }
)
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.grouped-grid {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.group-section {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  cursor: pointer;
  font: inherit;
  text-align: left;
  transition:
    background-color 0.15s,
    border-color 0.15s;

  &:hover {
    background: var(--bg-tile);
    border-color: var(--border-tile);
  }
}

.group-chevron {
  color: var(--text-muted);
  font-size: 12px;
  width: 14px;
  text-align: center;
}

.group-name {
  font-size: 15px;
  font-weight: var(--font-weight-semibold);
  color: var(--text-main);
}

.group-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  background: var(--bg-tile);
  border: 1px solid var(--border-tile);
  padding: 1px 8px;
  border-radius: 999px;
}

.group-spacer {
  flex: 1;
}

.website-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 1rem;

  // 同一行卡片等高拉伸，保证尺寸一致（无论是否有标签/描述）
  align-items: stretch;
}

@media (max-width: 768px) {
  .website-grid {
    grid-template-columns: 1fr;
  }
}
</style>
