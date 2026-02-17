<script setup lang="ts">
import type { DefineComponent } from 'vue'
import type { UIMessage, ChatStatus } from 'ai'
import type { ChatStreamPacket, ChatFileAttachment } from '~~/shared/types/api'
import type { ToolInvocationPart } from '~/components/tool/Invocation.vue'
import { useClipboard } from '@vueuse/core'
import { messageDtosToUIMessages } from '~/stores/conversation'
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
const tokenCounts = ref<Record<string, { input: number | null, output: number | null }>>({})

const toolInvocations = ref<Record<string, ToolInvocationPart>>({})
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
    messages.value = messageDtosToUIMessages(msgs)

    const assistantMsgs = messages.value.filter(m => m.role === 'assistant')
    if (assistantMsgs.length > 0) {
      fetchTokenCounts(assistantMsgs[0]!.id)
    }
  } catch {
    toast.add({ title: '加载历史消息失败', icon: 'i-lucide-alert-circle', color: 'error' })
  }
}

async function fetchTokenCounts(messageId: string, retryCount = 0) {
  if (!messageId || tokenCounts.value[messageId]) return
  const api = invocationApi()

  if (!isNew.value && chatId.value) {
    const invocations = await api.getAllByConversationId(chatId.value)
    if (invocations.length > 0) {
      const newCounts = { ...tokenCounts.value }
      for (const inv of invocations) {
        const key = inv.chatMessageExternalId || inv.chatMessageId
        if (key && (inv.inputTokenCount || inv.outputTokenCount)) {
          newCounts[key] = { input: inv.inputTokenCount, output: inv.outputTokenCount }
        }
      }
      tokenCounts.value = newCounts
      if (newCounts[messageId]) return
    }
  }

  const info = await api.getByMessageId(messageId)
  if (info && (info.inputTokenCount || info.outputTokenCount)) {
    tokenCounts.value = {
      ...tokenCounts.value,
      [messageId]: { input: info.inputTokenCount, output: info.outputTokenCount }
    }
  } else if (retryCount < 3) {
    setTimeout(() => fetchTokenCounts(messageId, retryCount + 1), 2000)
  }
}

function sendMessage(text: string, fileAttachments?: ChatFileAttachment[]) {
  if (!text.trim() || status.value === 'streaming' || status.value === 'submitted') return

  messages.value = [...messages.value, {
    id: `user-${Date.now()}`,
    role: 'user',
    parts: [{ type: 'text' as const, text: text.trim() }]
  }]

  status.value = 'submitted'
  chatError.value = undefined
  toolInvocations.value = {}

  const assistantId = `assistant-${Date.now()}`
  let assistantAdded = false
  let fullText = ''
  let reasoningText = ''
  let completedMessageId = ''

  function rebuildAssistantParts() {
    const parts: Array<Record<string, unknown>> = []
    if (reasoningText) {
      parts.push({ type: 'reasoning', text: reasoningText, state: status.value === 'streaming' ? 'streaming' : 'done' })
    }
    const invList = Object.values(toolInvocations.value)
    for (const inv of invList) {
      parts.push(inv as unknown as Record<string, unknown>)
    }
    if (fullText || invList.length === 0) {
      parts.push({ type: 'text', text: fullText })
    }
    const updated = [...messages.value]
    const lastIdx = updated.length - 1
    if (lastIdx >= 0 && updated[lastIdx]!.role === 'assistant') {
      updated[lastIdx] = { ...updated[lastIdx]!, parts }
      messages.value = updated
    }
  }

  const api = chatApi()
  const { promise, abort } = api.streamChat({
    message: text.trim(),
    conversationId: isNew.value ? null : chatId.value,
    agentName: null,
    modelId: model.value || null,
    files: fileAttachments ?? (uploadedFiles.value.length > 0 ? uploadedFiles.value : undefined),

    onStarted(packet: ChatStreamPacket) {
      // 保存元数据但不改变 status，保持 'submitted' 直到第一个 delta 到达
      if (isNew.value && packet.conversationId) {
        chatId.value = packet.conversationId
        window.history.replaceState({}, '', `/chat/${packet.conversationId}`)
        conversationStore.fetchConversations()
      }
      completedMessageId = packet.messageId || assistantId
    },

    onToolCall(packet: ChatStreamPacket) {
      if (!assistantAdded) {
        status.value = 'streaming'
        messages.value = [...messages.value, {
          id: completedMessageId || assistantId,
          role: 'assistant',
          parts: []
        }]
        assistantAdded = true
      }
      const callId = packet.toolCallId || `tc-${Date.now()}`
      let args: Record<string, unknown> = {}
      if (packet.toolArguments) {
        try { args = JSON.parse(packet.toolArguments) } catch {}
      }
      const inv: ToolInvocationPart = {
        type: 'tool-invocation',
        toolName: packet.toolName || 'unknown',
        toolDisplayName: packet.toolDisplayName || undefined,
        toolCallId: callId,
        args,
        state: 'calling'
      }
      toolInvocations.value = { ...toolInvocations.value, [callId]: inv }
      rebuildAssistantParts()
    },

    onToolResult(packet: ChatStreamPacket) {
      const callId = packet.toolCallId
      if (callId && toolInvocations.value[callId]) {
        let result: unknown = packet.toolResult
        if (typeof result === 'string') {
          try { result = JSON.parse(result) } catch {}
        }
        toolInvocations.value = {
          ...toolInvocations.value,
          [callId]: { ...toolInvocations.value[callId]!, result, state: 'completed' }
        }
        rebuildAssistantParts()
      }
    },

    onReasoning(packet: ChatStreamPacket) {
      if (!assistantAdded) {
        status.value = 'streaming'
        messages.value = [...messages.value, {
          id: completedMessageId || assistantId,
          role: 'assistant',
          parts: []
        }]
        assistantAdded = true
      }
      reasoningText += packet.reasoning || ''
      rebuildAssistantParts()
    },

    onDelta(packet: ChatStreamPacket) {
      if (!assistantAdded) {
        status.value = 'streaming'
        messages.value = [...messages.value, {
          id: completedMessageId || assistantId,
          role: 'assistant',
          parts: [{ type: 'text' as const, text: '' }]
        }]
        assistantAdded = true
      }
      fullText += packet.delta || ''
      rebuildAssistantParts()
    },

    onCompleted(packet: ChatStreamPacket) {
      status.value = 'ready'
      rebuildAssistantParts()
      conversationStore.fetchConversations()
      if (completedMessageId && (packet.inputTokens || packet.outputTokens)) {
        tokenCounts.value = {
          ...tokenCounts.value,
          [completedMessageId]: { input: packet.inputTokens ?? null, output: packet.outputTokens ?? null }
        }
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
  if (!fileAttachments) clearFiles()

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
  if (text) sendMessage(text)
}

const copiedId = ref<string | null>(null)

function copy(_e: MouseEvent, message: Record<string, unknown>) {
  const msg = message as unknown as UIMessage
  const textPart = msg.parts?.find(p => p.type === 'text' && 'text' in p)
  clipboard.copy(textPart && 'text' in textPart ? (textPart as { type: 'text', text: string }).text : '')
  copiedId.value = msg.id
  setTimeout(() => { copiedId.value = null }, 2000)
}

function formatTokenCount(n: number | null | undefined): string {
  if (n == null) return '-'
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

onMounted(async () => {
  const pending = conversationStore.consumePendingMessage()
  const pendingFiles = conversationStore.consumePendingFiles()

  if (pending && isNew.value) {
    sendMessage(pending, pendingFiles.length > 0 ? pendingFiles : undefined)
  } else {
    await loadHistory()
  }
})

onBeforeUnmount(() => {
  abortFn?.()
})
</script>

<template>
  <UDashboardPanel id="chat" class="relative min-h-0" :ui="{ body: 'p-0 sm:p-0 overscroll-none' }">
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
              { label: 'Copy', icon: copiedId === (messages[messages.length - 1] as any)?.id ? 'i-lucide-copy-check' : 'i-lucide-copy', onClick: copy }
            ]
          } : { actions: [] }"
          :spacing-offset="160"
          class="lg:pt-(--ui-header-height) pb-4 sm:pb-6"
        >
          <template #content="{ message }">
            <template v-for="(part, index) in (message as any).parts" :key="`${(message as any).id}-${part.type}-${index}${'state' in part ? `-${part.state}` : ''}`">
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
              <ToolInvocation
                v-else-if="part.type === 'tool-invocation'"
                :invocation="(part as any)"
              />
              <FileAvatar
                v-else-if="part.type === 'file'"
                :name="(part as any).url?.split('/').pop() || 'file'"
                :type="(part as any).mediaType || ''"
                :preview-url="(part as any).url"
              />
            </template>
          </template>

          <template #actions="{ message }">
            <template v-if="(message as any).role === 'assistant' && status !== 'streaming'">
              <UButton
                :icon="copiedId === (message as any).id ? 'i-lucide-copy-check' : 'i-lucide-copy'"
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
