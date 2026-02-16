<script setup lang="ts">
import type { DefineComponent } from 'vue'
import type { UIMessage, ChatStatus } from 'ai'
import type { ChatStreamPacket } from '~~/shared/types/api'
import { useClipboard } from '@vueuse/core'
import { messageDtoToUIMessage } from '~/stores/conversation'
import { chatApi } from '~/api/chat'
import ProseStreamPre from '../../components/prose/PreStream.vue'

const components = {
  pre: ProseStreamPre as unknown as DefineComponent
}

const route = useRoute()
const toast = useToast()
const clipboard = useClipboard()
const conversationStore = useConversationStore()

const chatId = ref(route.params.id as string)
const messages = ref<UIMessage[]>([])
const status = ref<ChatStatus>('ready')
const input = ref('')
const chatError = ref<Error | undefined>(undefined)
const isNew = computed(() => chatId.value === 'new')

let abortFn: (() => void) | null = null

async function loadHistory() {
  if (isNew.value) return

  if (conversationStore.conversations.length === 0) {
    await conversationStore.fetchConversations()
  }

  const conv = conversationStore.getByExternalId(chatId.value)
  if (!conv) return

  try {
    const msgs = await conversationStore.loadMessages(conv.id)
    messages.value = msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(messageDtoToUIMessage)
  } catch {
    toast.add({
      title: '加载历史消息失败',
      icon: 'i-lucide-alert-circle',
      color: 'error'
    })
  }
}

function sendMessage(text: string) {
  if (!text.trim() || status.value === 'streaming' || status.value === 'submitted') return

  const userMsg: UIMessage = {
    id: `user-${Date.now()}`,
    role: 'user',
    parts: [{ type: 'text' as const, text: text.trim() }]
  }
  messages.value = [...messages.value, userMsg]

  status.value = 'submitted'
  chatError.value = undefined

  const assistantId = `assistant-${Date.now()}`
  let assistantAdded = false
  let fullText = ''

  const api = chatApi()
  const { promise, abort } = api.streamChat({
    message: text.trim(),
    conversationId: isNew.value ? null : chatId.value,
    agentName: null,

    onStarted(packet: ChatStreamPacket) {
      status.value = 'streaming'

      if (isNew.value && packet.conversationId) {
        chatId.value = packet.conversationId
        window.history.replaceState({}, '', `/chat/${packet.conversationId}`)
        conversationStore.fetchConversations()
      }

      const newMsg: UIMessage = {
        id: packet.messageId || assistantId,
        role: 'assistant',
        parts: [{ type: 'text' as const, text: '' }]
      }
      messages.value = [...messages.value, newMsg]
      assistantAdded = true
    },

    onDelta(packet: ChatStreamPacket) {
      if (!assistantAdded) {
        const newMsg: UIMessage = {
          id: assistantId,
          role: 'assistant',
          parts: [{ type: 'text' as const, text: '' }]
        }
        messages.value = [...messages.value, newMsg]
        assistantAdded = true
      }

      fullText += packet.delta || ''
      const updated = [...messages.value]
      const lastIdx = updated.length - 1
      if (lastIdx >= 0 && updated[lastIdx]!.role === 'assistant') {
        updated[lastIdx] = {
          ...updated[lastIdx]!,
          parts: [{ type: 'text' as const, text: fullText }]
        }
        messages.value = updated
      }
    },

    onCompleted() {
      status.value = 'ready'
      conversationStore.fetchConversations()
    },

    onError(packet: ChatStreamPacket) {
      status.value = 'error'
      chatError.value = new Error(packet.error || '请求失败')
      toast.add({
        title: packet.error || '请求失败',
        icon: 'i-lucide-alert-circle',
        color: 'error',
        duration: 0
      })
    }
  })

  abortFn = abort

  promise.catch(() => {
    if (status.value === 'streaming' || status.value === 'submitted') {
      status.value = 'error'
      chatError.value = new Error('连接中断')
    }
  })
}

function handleSubmit(e: Event) {
  e.preventDefault()
  if (input.value.trim()) {
    sendMessage(input.value)
    input.value = ''
  }
}

function stopChat() {
  abortFn?.()
  status.value = 'ready'
}

function regenerate() {
  const lastUser = [...messages.value].reverse().find(m => m.role === 'user')
  if (!lastUser) return

  const lastAssistantIdx = messages.value.findLastIndex(m => m.role === 'assistant')
  if (lastAssistantIdx >= 0) {
    messages.value = messages.value.filter((_, i) => i !== lastAssistantIdx)
  }

  const textPart = lastUser.parts.find((p: { type: string }) => p.type === 'text')
  const text = textPart && 'text' in textPart ? (textPart as { type: 'text', text: string }).text : ''
  if (text) {
    sendMessage(text)
  }
}

const copied = ref(false)

function copy(_e: MouseEvent, message: Record<string, unknown>) {
  const msg = message as unknown as UIMessage
  let content = ''
  if (msg.parts) {
    for (const p of msg.parts) {
      if (p.type === 'text' && 'text' in p) {
        content = (p as { type: 'text', text: string }).text
        break
      }
    }
  }
  clipboard.copy(content)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

onMounted(async () => {
  const pending = conversationStore.consumePendingMessage()
  if (pending && isNew.value) {
    sendMessage(pending)
  } else {
    await loadHistory()
  }
})

onBeforeUnmount(() => {
  abortFn?.()
})
</script>

<template>
  <UDashboardPanel id="chat" class="relative" :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <DashboardNavbar />
    </template>

    <template #body>
      <UContainer class="flex-1 flex flex-col gap-4 sm:gap-6">
        <UChatMessages
          should-auto-scroll
          :messages="(messages as any)"
          :status="status"
          :assistant="status !== 'streaming' ? { actions: [{ label: 'Copy', icon: copied ? 'i-lucide-copy-check' : 'i-lucide-copy', onClick: copy }] } : { actions: [] }"
          :spacing-offset="160"
          class="lg:pt-(--ui-header-height) pb-4 sm:pb-6"
        >
          <template #content="{ message }">
            <template v-for="(part, index) in (message as any).parts" :key="`${(message as any).id}-${part.type}-${index}`">
              <Reasoning
                v-if="part.type === 'reasoning'"
                :text="part.text"
                :is-streaming="part.state !== 'done'"
              />
              <MDCCached
                v-else-if="part.type === 'text' && (message as any).role === 'assistant'"
                :value="part.text"
                :cache-key="`${(message as any).id}-${index}`"
                :components="components"
                :parser-options="{ highlight: false }"
                class="*:first:mt-0 *:last:mb-0"
              />
              <p v-else-if="part.type === 'text' && (message as any).role === 'user'" class="whitespace-pre-wrap">
                {{ part.text }}
              </p>
            </template>
          </template>
        </UChatMessages>

        <UChatPrompt
          v-model="input"
          :error="chatError"
          variant="subtle"
          class="sticky bottom-0 [view-transition-name:chat-prompt] rounded-b-none z-10"
          :ui="{ base: 'px-1.5' }"
          @submit="handleSubmit"
        >
          <template #footer>
            <div />

            <UChatPromptSubmit
              :status="status"
              color="neutral"
              size="sm"
              @stop="stopChat"
              @reload="regenerate"
            />
          </template>
        </UChatPrompt>
      </UContainer>
    </template>
  </UDashboardPanel>
</template>
