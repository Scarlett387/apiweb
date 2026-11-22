<template>
  <div class="emoji-picker">
    <button
      v-for="e in CUTE_EMOJIS"
      :key="e"
      type="button"
      class="emoji-item"
      :class="{ active: e === modelValue }"
      :title="e"
      :aria-label="`选择图标 ${e}`"
      @click="$emit('update:modelValue', e === modelValue ? '' : e)"
    >
      {{ e }}
    </button>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    modelValue: string
    /** 只展示这一批 emoji（不传用默认可爱系列） */
    emojis?: string[]
  }>(),
  { modelValue: '', emojis: undefined }
)

defineEmits<{ (e: 'update:modelValue', v: string): void }>()

// 可爱系列 emoji：甜食 / 小动物 / 自然 / 心情 / 实用
const CUTE_EMOJIS = [
  '🍬',
  '🍭',
  '🍰',
  '🍩',
  '🧁',
  '🍪',
  '🍫',
  '🍨',
  '🐱',
  '🐰',
  '🐶',
  '🦄',
  '🐻',
  '🦊',
  '🐼',
  '🐥',
  '🌈',
  '🌸',
  '🌻',
  '🍀',
  '🌙',
  '⭐',
  '✨',
  '💫',
  '💖',
  '🧡',
  '💙',
  '💜',
  '🎈',
  '🎁',
  '🎀',
  '🔔',
  '🎮',
  '🚀',
  '🛸',
  '🔮',
  '💎',
  '📌',
  '💡',
  '🔧',
  '📚',
  '🎧',
  '🎨',
  '☕',
  '🍵',
  '🧋',
  '🍕',
  '🧪'
]
</script>

<style scoped lang="scss">
.emoji-picker {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 6px;
  border-radius: 10px;
  background: var(--bg-tile, rgba(127, 127, 127, 0.08));
}

.emoji-item {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  line-height: 1;
  border: none;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition:
    background-color 0.15s,
    transform 0.15s;

  &:hover {
    background: rgba(127, 127, 127, 0.16);
    transform: scale(1.12);
  }

  &.active {
    background: var(--primary-soft, rgba(59, 130, 246, 0.14));
    box-shadow: inset 0 0 0 1.5px var(--color-primary, #3b82f6);
  }
}
</style>
