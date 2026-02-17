<script setup lang="ts">
import { LazyModalConfirm } from '#components'

const route = useRoute()
const toast = useToast()
const overlay = useOverlay()
const authStore = useAuthStore()
const conversationStore = useConversationStore()

const open = ref(false)

const deleteModal = overlay.create(LazyModalConfirm, {
  props: {
    title: '删除会话',
    description: '确定要删除此会话吗？删除后无法恢复。'
  }
})

await conversationStore.fetchConversations()

const chats = computed(() =>
  conversationStore.sortedConversations.map(conv => ({
    id: conv.id,
    externalId: conv.externalConversationId,
    label: conv.title || '未命名',
    to: `/chat/${conv.externalConversationId}`,
    icon: 'i-lucide-message-circle',
    createdAt: conv.lastMessageAt || conv.createdAt
  }))
)

const { groups } = useChats(chats)

const items = computed(() => groups.value?.flatMap((group) => {
  return [{
    label: group.label,
    type: 'label' as const
  }, ...group.items.map(item => ({
    ...item,
    slot: 'chat' as const,
    icon: undefined,
    class: item.label === '未命名' ? 'text-muted' : ''
  }))]
}))

async function deleteChat(id: string) {
  const instance = deleteModal.open()
  const result = await instance.result
  if (!result) return

  await conversationStore.deleteConversation(id)

  toast.add({
    title: '会话已删除',
    icon: 'i-lucide-trash'
  })

  const conv = conversationStore.conversations.find(c => c.id === id)
  if (conv && route.params.id === conv.externalConversationId) {
    navigateTo('/')
  } else if (route.params.id && !conversationStore.getByExternalId(route.params.id as string)) {
    navigateTo('/')
  }
}

defineShortcuts({
  c: () => {
    navigateTo('/')
  }
})
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      :min-size="12"
      collapsible
      resizable
      class="bg-elevated/50"
    >
      <template #header="{ collapsed }">
        <NuxtLink to="/" class="flex items-center gap-1.5">
          <UIcon name="i-lucide-bot" class="size-7 text-primary shrink-0" />
          <span v-if="!collapsed" class="text-lg font-bold text-highlighted">Operion</span>
        </NuxtLink>

        <div v-if="!collapsed" class="flex items-center gap-1.5 ms-auto">
          <UDashboardSearchButton collapsed />
          <UDashboardSidebarCollapse />
        </div>
      </template>

      <template #default="{ collapsed }">
        <div class="flex flex-col gap-1.5">
          <UButton
            v-bind="collapsed ? { icon: 'i-lucide-plus' } : { label: '新建会话' }"
            variant="soft"
            block
            to="/"
            @click="open = false"
          />

          <template v-if="collapsed">
            <UDashboardSearchButton collapsed />
            <UDashboardSidebarCollapse />
          </template>
        </div>

        <UNavigationMenu
          v-if="!collapsed"
          :items="items"
          :collapsed="collapsed"
          orientation="vertical"
          :ui="{ link: 'overflow-hidden' }"
        >
          <template #chat-trailing="{ item }">
            <div class="flex -mr-1.25 translate-x-full group-hover:translate-x-0 transition-transform">
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                class="text-muted hover:text-primary hover:bg-accented/50 focus-visible:bg-accented/50 p-0.5"
                tabindex="-1"
                @click.stop.prevent="deleteChat((item as any).id)"
              />
            </div>
          </template>
        </UNavigationMenu>
      </template>

      <template #footer="{ collapsed }">
        <UserMenu v-if="authStore.isLoggedIn" :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch
      placeholder="搜索会话..."
      :groups="[{
        id: 'links',
        items: [{
          label: '新建会话',
          to: '/',
          icon: 'i-lucide-square-pen'
        }]
      }, ...groups]"
    />

    <slot />
  </UDashboardGroup>
</template>
