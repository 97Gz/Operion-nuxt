<script setup lang="ts">
import type { DefineComponent } from 'vue'
import type { UIMessage, ChatStatus } from 'ai'
import type { ChatStreamPacket } from '~~/shared/types/api'
import { useClipboard } from '@vueuse/core'
import { messageDtoToUIMessage } from '~/stores/conversation'
import { chatApi } from '~/api/chat'
import { invocationApi } from '~/api/invocation'
import ProseStreamPre from '../../components/prose/PreStream.vue'

const components = {
  pre: ProseStreamPre as unknown as DefineComponent
}

const route = useRoute()
const toast = useToast()
const clipboard = useClipboard()
const conversationStore = useConversationStore()
const { model } = useModels()
const { files, isUploading, uploadedFiles, addFiles, removeFile, clearFiles } = useFileUploadLocal()

const chatId = ref(route.params.id as string)
const messages = ref<UIMessage[]>([])
const status = ref<ChatStatus>('ready')
const input = ref('')
const chatError = ref<Error | undefined>(undefined)
const isNew = computed(() => chatId.value === 'new')

// Token 计数存储：messageId -> { input, output }
const tokenCounts = ref<Record<string, { input: number | null, output: number | null }>>({})

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

    // 加载历史消息后，批量获取所有 assistant 消息的 token 数据
    const assistantMsgs = messages.value.filter(m => m.role === 'assistant')
    if (assistantMsgs.length > 0) {
      fetchTokenCounts(assistantMsgs[0]!.id)
    }
  } catch {
    toast.add({
      title: '加载历史消息失败',
      icon: 'i-lucide-alert-circle',
      color: 'error'
    })
  }
}

async function fetchTokenCounts(messageId: string, retryCount = 0) {
  if (!messageId || tokenCounts.value[messageId]) return
  const api = invocationApi()

  // 优先通过 conversationId 批量查询所有 token 数据
  if (!isNew.value && chatId.value) {
    const invocations = await api.getAllByConversationId(chatId.value)
    if (invocations.length > 0) {
      const newCounts = { ...tokenCounts.value }
      for (const inv of invocations) {
        // 使用 chatMessageExternalId（即 MAF MessageId）来匹配前端消息
        const key = inv.chatMessageExternalId || inv.chatMessageId
        if (key && (inv.inputTokenCount || inv.outputTokenCount)) {
          newCounts[key] = {
            input: inv.inputTokenCount,
            output: inv.outputTokenCount
          }
        }
      }
      tokenCounts.value = newCounts
      // 如果找到当前消息的数据，直接返回
      if (newCounts[messageId]) return
    }
  }

  // 回退到通过 messageId 单独查询
  const info = await api.getByMessageId(messageId)
  if (info && (info.inputTokenCount || info.outputTokenCount)) {
    tokenCounts.value = {
      ...tokenCounts.value,
      [messageId]: {
        input: info.inputTokenCount,
        output: info.outputTokenCount
      }
    }
  } else if (retryCount < 3) {
    setTimeout(() => fetchTokenCounts(messageId, retryCount + 1), 2000)
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
  let completedMessageId = ''

  const api = chatApi()
  const { promise, abort } = api.streamChat({
    message: text.trim(),
    conversationId: isNew.value ? null : chatId.value,
    agentName: null,
    modelId: model.value || null,
    files: uploadedFiles.value.length > 0 ? uploadedFiles.value : undefined,

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
      completedMessageId = packet.messageId || assistantId
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
        completedMessageId = assistantId
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

    onCompleted(packet: ChatStreamPacket) {
      status.value = 'ready'
      conversationStore.fetchConversations()

      // 提取 SSE 返回的 token 计数
      if (completedMessageId && (packet.inputTokens || packet.outputTokens)) {
        tokenCounts.value = {
          ...tokenCounts.value,
          [completedMessageId]: {
            input: packet.inputTokens ?? null,
            output: packet.outputTokens ?? null
          }
        }
      } else if (completedMessageId) {
        // 如果 SSE 未返回 token，异步从后端查询
        fetchTokenCounts(completedMessageId)
      }
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
  clearFiles()

  promise.catch(() => {
    if (status.value === 'streaming' || status.value === 'submitted') {
      status.value = 'error'
      chatError.value = new Error('连接中断')
    }
  })
}

function sendMessageWithFiles(text: string, fileAttachments: import('~~/shared/types/api').ChatFileAttachment[]) {
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
  let completedMessageId = ''

  const api = chatApi()
  const { promise, abort } = api.streamChat({
    message: text.trim(),
    conversationId: isNew.value ? null : chatId.value,
    agentName: null,
    modelId: model.value || null,
    files: fileAttachments,

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
      completedMessageId = packet.messageId || assistantId
    },

    onDelta(packet: ChatStreamPacket) {
      if (!assistantAdded) {
        const newMsg: UIMessage = {
          id: assistantId, role: 'assistant',
          parts: [{ type: 'text' as const, text: '' }]
        }
        messages.value = [...messages.value, newMsg]
        assistantAdded = true
        completedMessageId = assistantId
      }
      fullText += packet.delta || ''
      const updated = [...messages.value]
      const lastIdx = updated.length - 1
      if (lastIdx >= 0 && updated[lastIdx]!.role === 'assistant') {
        updated[lastIdx] = { ...updated[lastIdx]!, parts: [{ type: 'text' as const, text: fullText }] }
        messages.value = updated
      }
    },

    onCompleted(packet: ChatStreamPacket) {
      status.value = 'ready'
      conversationStore.fetchConversations()
      if (completedMessageId && (packet.inputTokens || packet.outputTokens)) {
        tokenCounts.value = { ...tokenCounts.value, [completedMessageId]: { input: packet.inputTokens ?? null, output: packet.outputTokens ?? null } }
      } else if (completedMessageId) {
        fetchTokenCounts(completedMessageId)
      }
    },

    onError(packet: ChatStreamPacket) {
      status.value = 'error'
      chatError.value = new Error(packet.error || '请求失败')
      toast.add({ title: packet.error || '请求失败', icon: 'i-lucide-alert-circle', color: 'error', duration: 0 })
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
  if (input.value.trim() && !isUploading.value) {
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

function formatTokenCount(n: number | null | undefined): string {
  if (n == null) return '-'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

onMounted(async () => {
  const pending = conversationStore.consumePendingMessage()
  const pendingFilesList = conversationStore.consumePendingFiles()

  if (pending && isNew.value) {
    // 如果有从首页带过来的文件附件，临时设置到 uploadedFiles 对应位置
    if (pendingFilesList.length > 0) {
      // 直接将文件作为参数传给 sendMessageWithFiles
      sendMessageWithFiles(pending, pendingFilesList)
    } else {
      sendMessage(pending)
    }
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
          :assistant="status !== 'streaming' ? {
            actions: [
              { label: 'Copy', icon: copied ? 'i-lucide-copy-check' : 'i-lucide-copy', onClick: copy }
            ]
          } : { actions: [] }"
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
              <FileAvatar
                v-else-if="part.type === 'file'"
                :name="(part as any).url?.split('/').pop() || 'file'"
                :type="(part as any).mediaType || ''"
                :preview-url="(part as any).url"
              />
            </template>
          </template>

          <template #indicator>
            <span />
            <span />
            <span />
          </template>

          <template #actions="{ message }">
            <template v-if="(message as any).role === 'assistant' && status !== 'streaming'">
              <UButton
                :icon="copied ? 'i-lucide-copy-check' : 'i-lucide-copy'"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="copy($event, message)"
              />
              <span
                v-if="tokenCounts[(message as any).id]"
                class="flex items-center gap-2 ml-1 text-xs text-dimmed"
              >
                <span class="flex items-center gap-0.5" title="输入 Tokens">
                  <UIcon name="i-lucide-arrow-up" class="size-3 text-green-500" />
                  {{ formatTokenCount(tokenCounts[(message as any).id]?.input) }}
                </span>
                <span class="flex items-center gap-0.5" title="输出 Tokens">
                  <UIcon name="i-lucide-arrow-down" class="size-3 text-blue-500" />
                  {{ formatTokenCount(tokenCounts[(message as any).id]?.output) }}
                </span>
              </span>
            </template>
          </template>
        </UChatMessages>

        <UChatPrompt
          v-model="input"
          :error="chatError"
          :disabled="isUploading"
          variant="subtle"
          class="sticky bottom-0 [view-transition-name:chat-prompt] rounded-b-none z-10"
          :ui="{ base: 'px-1.5' }"
          @submit="handleSubmit"
        >
          <template v-if="files.length > 0" #header>
            <div class="flex flex-wrap gap-2">
              <FileAvatar
                v-for="fileWithStatus in files"
                :key="fileWithStatus.id"
                :name="fileWithStatus.file.name"
                :type="fileWithStatus.file.type"
                :preview-url="fileWithStatus.previewUrl"
                :status="fileWithStatus.status"
                :error="fileWithStatus.error"
                removable
                @remove="removeFile(fileWithStatus.id)"
              />
            </div>
          </template>

          <template #footer>
            <div class="flex items-center gap-1">
              <FileUploadButton @files-selected="addFiles($event)" />
              <ModelSelect v-model="model" />
            </div>

            <UChatPromptSubmit
              :status="status"
              :disabled="isUploading"
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
