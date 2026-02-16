<script setup lang="ts">
const input = ref('')
const conversationStore = useConversationStore()

function createChat(prompt: string) {
  if (!prompt.trim()) return
  conversationStore.setPendingMessage(prompt.trim())
  navigateTo('/chat/new')
}

function onSubmit() {
  createChat(input.value)
}

const quickChats = [
  {
    label: '你好，请介绍一下你自己',
    icon: 'i-lucide-bot'
  },
  {
    label: '帮我写一段 Vue 3 的组件代码',
    icon: 'i-logos-vue'
  },
  {
    label: '解释什么是 TypeScript 泛型',
    icon: 'i-lucide-code'
  },
  {
    label: '今天的天气怎么样？',
    icon: 'i-lucide-sun'
  }
]
</script>

<template>
  <UDashboardPanel id="home" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <DashboardNavbar />
    </template>

    <template #body>
      <UContainer class="flex-1 flex flex-col justify-center gap-4 sm:gap-6 py-8">
        <h1 class="text-3xl sm:text-4xl text-highlighted font-bold">
          有什么我可以帮你的？
        </h1>

        <UChatPrompt
          v-model="input"
          status="ready"
          class="[view-transition-name:chat-prompt]"
          variant="subtle"
          :ui="{ base: 'px-1.5' }"
          @submit="onSubmit"
        >
          <template #footer>
            <div />

            <UChatPromptSubmit color="neutral" size="sm" />
          </template>
        </UChatPrompt>

        <div class="flex flex-wrap gap-2">
          <UButton
            v-for="quickChat in quickChats"
            :key="quickChat.label"
            :icon="quickChat.icon"
            :label="quickChat.label"
            size="sm"
            color="neutral"
            variant="outline"
            class="rounded-full"
            @click="createChat(quickChat.label)"
          />
        </div>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
