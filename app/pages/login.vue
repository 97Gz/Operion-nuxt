<script setup lang="ts">
definePageMeta({
  layout: false
})

const authStore = useAuthStore()
const toast = useToast()

const mode = ref<'login' | 'register'>('login')
const form = ref({
  username: '',
  email: '',
  password: '',
  confirmPassword: ''
})
const loading = ref(false)

const isLogin = computed(() => mode.value === 'login')

function switchMode() {
  mode.value = isLogin.value ? 'register' : 'login'
  form.value = { username: '', email: '', password: '', confirmPassword: '' }
}

async function handleSubmit() {
  if (loading.value) return

  if (!form.value.username.trim() || !form.value.password) {
    toast.add({ title: '请填写用户名和密码', icon: 'i-lucide-alert-circle', color: 'error' })
    return
  }

  if (!isLogin.value) {
    if (!form.value.email.trim()) {
      toast.add({ title: '请填写邮箱', icon: 'i-lucide-alert-circle', color: 'error' })
      return
    }
    if (form.value.password !== form.value.confirmPassword) {
      toast.add({ title: '两次密码不一致', icon: 'i-lucide-alert-circle', color: 'error' })
      return
    }
    if (form.value.password.length < 6) {
      toast.add({ title: '密码长度至少 6 位', icon: 'i-lucide-alert-circle', color: 'error' })
      return
    }
  }

  loading.value = true
  try {
    if (isLogin.value) {
      await authStore.login(form.value.username.trim(), form.value.password)
    } else {
      await authStore.register(form.value.username.trim(), form.value.email.trim(), form.value.password)
    }
    toast.add({
      title: isLogin.value ? '登录成功' : '注册成功',
      icon: 'i-lucide-check-circle',
      color: 'success'
    })
    navigateTo('/')
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '操作失败'
    toast.add({ title: message, icon: 'i-lucide-alert-circle', color: 'error' })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-dvh flex">
    <!-- 左侧品牌区 -->
    <div class="hidden lg:flex lg:w-[480px] xl:w-[560px] bg-primary/5 dark:bg-primary/10 items-center justify-center relative overflow-hidden">
      <div class="absolute inset-0 opacity-5">
        <div class="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-primary/30 blur-3xl" />
        <div class="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-primary/20 blur-3xl" />
      </div>
      <div class="relative z-10 px-12 text-center">
        <div class="flex items-center justify-center gap-3 mb-8">
          <UIcon name="i-lucide-bot" class="size-12 text-primary" />
          <span class="text-4xl font-bold text-highlighted">Operion</span>
        </div>
        <p class="text-lg text-muted leading-relaxed max-w-sm mx-auto">
          智能 AI 对话助手，支持多模型切换、文件上传、流式输出，助力高效工作。
        </p>
        <div class="flex items-center justify-center gap-6 mt-10 text-sm text-muted">
          <div class="flex items-center gap-1.5">
            <UIcon name="i-lucide-zap" class="size-4 text-primary" />
            <span>多模型支持</span>
          </div>
          <div class="flex items-center gap-1.5">
            <UIcon name="i-lucide-shield-check" class="size-4 text-primary" />
            <span>安全可靠</span>
          </div>
          <div class="flex items-center gap-1.5">
            <UIcon name="i-lucide-gauge" class="size-4 text-primary" />
            <span>流式响应</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧表单区 -->
    <div class="flex-1 flex items-center justify-center p-6 sm:p-8">
      <div class="w-full max-w-md">
        <!-- 移动端品牌 -->
        <div class="lg:hidden flex items-center justify-center gap-2 mb-10">
          <UIcon name="i-lucide-bot" class="size-8 text-primary" />
          <span class="text-2xl font-bold text-highlighted">Operion</span>
        </div>

        <!-- 标题 -->
        <div class="text-center mb-8">
          <h1 class="text-2xl font-bold text-highlighted">
            {{ isLogin ? '欢迎回来' : '创建账户' }}
          </h1>
          <p class="mt-2 text-sm text-muted">
            {{ isLogin ? '登录以继续使用 Operion' : '注册一个新账户开始使用' }}
          </p>
        </div>

        <!-- 表单 -->
        <form class="space-y-5" @submit.prevent="handleSubmit">
          <UFormField label="用户名">
            <UInput
              v-model="form.username"
              placeholder="请输入用户名"
              icon="i-lucide-user"
              size="lg"
              class="w-full"
              :disabled="loading"
              autofocus
            />
          </UFormField>

          <UFormField v-if="!isLogin" label="邮箱">
            <UInput
              v-model="form.email"
              type="email"
              placeholder="请输入邮箱"
              icon="i-lucide-mail"
              size="lg"
              class="w-full"
              :disabled="loading"
            />
          </UFormField>

          <UFormField label="密码">
            <UInput
              v-model="form.password"
              type="password"
              placeholder="请输入密码"
              icon="i-lucide-lock"
              size="lg"
              class="w-full"
              :disabled="loading"
            />
          </UFormField>

          <UFormField v-if="!isLogin" label="确认密码">
            <UInput
              v-model="form.confirmPassword"
              type="password"
              placeholder="请再次输入密码"
              icon="i-lucide-lock"
              size="lg"
              class="w-full"
              :disabled="loading"
            />
          </UFormField>

          <UButton
            type="submit"
            :label="isLogin ? '登录' : '注册'"
            color="primary"
            size="lg"
            block
            :loading="loading"
            class="mt-2"
          />
        </form>

        <!-- 切换模式 -->
        <p class="mt-6 text-center text-sm text-muted">
          {{ isLogin ? '还没有账户？' : '已有账户？' }}
          <button
            type="button"
            class="text-primary font-medium hover:underline ml-1"
            :disabled="loading"
            @click="switchMode"
          >
            {{ isLogin ? '立即注册' : '去登录' }}
          </button>
        </p>
      </div>
    </div>
  </div>
</template>
