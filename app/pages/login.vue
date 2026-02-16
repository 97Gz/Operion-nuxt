<script setup lang="ts">
definePageMeta({
  layout: false
})

const authStore = useAuthStore()
const toast = useToast()

const mode = ref<'login' | 'register'>('login')
const loading = ref(false)

const form = reactive({
  username: '',
  email: '',
  password: '',
  confirmPassword: ''
})

const formError = ref('')

async function handleSubmit() {
  formError.value = ''

  if (!form.username.trim() || !form.password.trim()) {
    formError.value = '请填写所有必填项'
    return
  }

  if (mode.value === 'register') {
    if (!form.email.trim()) {
      formError.value = '请填写邮箱'
      return
    }
    if (form.password.length < 6) {
      formError.value = '密码不能少于 6 位'
      return
    }
    if (form.password !== form.confirmPassword) {
      formError.value = '两次输入的密码不一致'
      return
    }
  }

  loading.value = true
  try {
    if (mode.value === 'login') {
      await authStore.login(form.username.trim(), form.password)
    } else {
      await authStore.register(form.username.trim(), form.email.trim(), form.password)
    }
    toast.add({
      title: mode.value === 'login' ? '登录成功' : '注册成功',
      icon: 'i-lucide-check-circle',
      color: 'success'
    })
    navigateTo('/')
  } catch (e: unknown) {
    formError.value = (e as Error).message || '操作失败'
  } finally {
    loading.value = false
  }
}

function switchMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  formError.value = ''
}

const colorMode = useColorMode()
const color = computed(() => colorMode.value === 'dark' ? '#1b1718' : 'white')

useHead({
  meta: [
    { key: 'theme-color', name: 'theme-color', content: color }
  ]
})
</script>

<template>
  <UApp :toaster="{ position: 'top-right' }">
    <div class="min-h-dvh flex items-center justify-center bg-default p-4">
      <div class="w-full max-w-sm flex flex-col items-center gap-6">
        <div class="flex items-end gap-1">
          <Logo class="h-10 w-auto" />
          <span class="text-2xl font-bold text-highlighted">Operion</span>
        </div>

        <UCard class="w-full" :ui="{ body: 'space-y-4' }">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="text-lg font-semibold text-highlighted">
                {{ mode === 'login' ? '登录' : '注册' }}
              </h2>
              <UColorModeButton />
            </div>
          </template>

          <form class="space-y-4" @submit.prevent="handleSubmit">
            <UFormField label="用户名" required>
              <UInput
                v-model="form.username"
                icon="i-lucide-user"
                placeholder="请输入用户名"
                autocomplete="username"
                :disabled="loading"
              />
            </UFormField>

            <UFormField v-if="mode === 'register'" label="邮箱" required>
              <UInput
                v-model="form.email"
                type="email"
                icon="i-lucide-mail"
                placeholder="请输入邮箱"
                autocomplete="email"
                :disabled="loading"
              />
            </UFormField>

            <UFormField label="密码" required>
              <UInput
                v-model="form.password"
                type="password"
                icon="i-lucide-lock"
                placeholder="请输入密码"
                autocomplete="current-password"
                :disabled="loading"
              />
            </UFormField>

            <UFormField v-if="mode === 'register'" label="确认密码" required>
              <UInput
                v-model="form.confirmPassword"
                type="password"
                icon="i-lucide-lock"
                placeholder="请再次输入密码"
                autocomplete="new-password"
                :disabled="loading"
              />
            </UFormField>

            <p v-if="formError" class="text-sm text-error">
              {{ formError }}
            </p>

            <UButton
              type="submit"
              block
              :label="mode === 'login' ? '登录' : '注册'"
              :loading="loading"
              color="primary"
            />
          </form>

          <template #footer>
            <p class="text-center text-sm text-muted">
              {{ mode === 'login' ? '没有账号？' : '已有账号？' }}
              <UButton
                variant="link"
                class="p-0"
                :label="mode === 'login' ? '立即注册' : '返回登录'"
                @click="switchMode"
              />
            </p>
          </template>
        </UCard>
      </div>
    </div>
  </UApp>
</template>
