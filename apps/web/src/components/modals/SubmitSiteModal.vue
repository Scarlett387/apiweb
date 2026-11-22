<template>
  <div class="submit-site-modal">
    <p class="submit-intro">发现好站想分享给大家?填在这里,站长审核通过后就会出现在导航里。</p>

    <form class="submit-form" @submit.prevent="handleSubmit">
      <div class="form-item">
        <label class="form-label" for="submit-name">
          站点名称
          <span class="required">*</span>
        </label>
        <BaseInput
          id="submit-name"
          v-model="form.name"
          placeholder="例如:在线工具集"
          :maxlength="100"
          required
        />
      </div>

      <div class="form-item">
        <label class="form-label" for="submit-url">
          网址
          <span class="required">*</span>
        </label>
        <BaseInput
          id="submit-url"
          v-model="form.url"
          placeholder="https://example.com"
          :maxlength="2000"
          required
        />
      </div>

      <div class="form-item">
        <label class="form-label" for="submit-desc">简单介绍</label>
        <BaseInput
          id="submit-desc"
          v-model="form.description"
          placeholder="一句话介绍这个站(选填)"
          :maxlength="200"
        />
      </div>

      <div class="form-item">
        <label class="form-label" for="submit-contact">联系方式</label>
        <BaseInput
          id="submit-contact"
          v-model="form.contact"
          placeholder="QQ / 邮箱等(选填,方便站长联系你)"
          :maxlength="100"
        />
      </div>

      <p v-if="errorMsg" class="submit-error">
        <i class="fas fa-circle-exclamation" aria-hidden="true" />
        {{ errorMsg }}
      </p>

      <div class="submit-actions">
        <BaseButton
          type="submit"
          variant="primary"
          size="md"
          :loading="submitting"
          :disabled="!form.name.trim() || !form.url.trim()"
        >
          提交推荐
        </BaseButton>
        <BaseButton variant="ghost" size="md" @click="emit('close')">取消</BaseButton>
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { BaseInput, BaseButton } from '@nav/ui'
import { useUIStore } from '@/stores/ui'

const emit = defineEmits<{ (e: 'close'): void }>()
const uiStore = useUIStore()

const form = reactive({
  name: '',
  url: '',
  description: '',
  contact: ''
})
const submitting = ref(false)
const errorMsg = ref('')

const handleSubmit = async () => {
  if (submitting.value) return
  errorMsg.value = ''
  const url = form.url.trim()
  if (!/^https?:\/\/.+/i.test(url)) {
    errorMsg.value = '网址需要以 http(s):// 开头'
    return
  }
  submitting.value = true
  try {
    const res = await fetch('/api/public/submit', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: form.name.trim(),
        url,
        description: form.description.trim() || undefined,
        contact: form.contact.trim() || undefined
      })
    })
    const json = (await res.json()) as { success?: boolean; message?: string }
    if (res.ok && json.success) {
      uiStore.showToast(json.message || '投稿已提交,感谢推荐!', 'success')
      emit('close')
    } else {
      errorMsg.value = json.message || '提交失败,请稍后重试'
    }
  } catch {
    errorMsg.value = '网络异常,请稍后重试'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.submit-site-modal {
  padding: 4px 2px 2px;
}

.submit-intro {
  margin: 0 0 16px;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-secondary);
}

.submit-form {
  display: grid;
  gap: 14px;
}

.form-item {
  display: grid;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.required {
  color: var(--color-error);
}

.submit-error {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--color-error) 8%, var(--bg-panel));
  color: color-mix(in srgb, var(--color-error) 75%, var(--text-main));
  font-size: 13px;
}

.submit-actions {
  display: flex;
  gap: 10px;
  margin-top: 4px;
}
</style>
