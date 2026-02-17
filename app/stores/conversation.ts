import { defineStore } from 'pinia'
import type { UIMessage } from 'ai'
import type { ConversationDto, MessageDto, ChatFileAttachment } from '~~/shared/types/api'
import { conversationApi } from '~/api/conversation'

const PAGE_SIZE = 50

interface ConversationState {
  conversations: ConversationDto[]
  loading: boolean
  hasMore: boolean
  pendingMessage: string | null
  pendingFiles: ChatFileAttachment[]
}

export const useConversationStore = defineStore('conversation', {
  state: (): ConversationState => ({
    conversations: [],
    loading: false,
    hasMore: true,
    pendingMessage: null,
    pendingFiles: []
  }),

  getters: {
    sortedConversations: (state) => {
      return [...state.conversations].sort((a, b) => {
        const dateA = a.lastMessageAt || a.createdAt
        const dateB = b.lastMessageAt || b.createdAt
        return new Date(dateB).getTime() - new Date(dateA).getTime()
      })
    },

    getByExternalId: (state) => {
      return (externalId: string) =>
        state.conversations.find(c => c.externalConversationId === externalId)
    }
  },

  actions: {
    async fetchConversations() {
      this.loading = true
      try {
        const api = conversationApi()
        this.conversations = await api.list(0, PAGE_SIZE)
        this.hasMore = this.conversations.length >= PAGE_SIZE
      } catch {
        this.conversations = []
        this.hasMore = false
      } finally {
        this.loading = false
      }
    },

    async fetchMoreConversations() {
      if (this.loading || !this.hasMore) return
      this.loading = true
      try {
        const api = conversationApi()
        const more = await api.list(this.conversations.length, PAGE_SIZE)
        this.conversations = [...this.conversations, ...more]
        this.hasMore = more.length >= PAGE_SIZE
      } catch {
        // 加载更多失败，静默处理
      } finally {
        this.loading = false
      }
    },

    async deleteConversation(id: string) {
      const api = conversationApi()
      await api.delete(id)
      this.conversations = this.conversations.filter(c => c.id !== id)
    },

    async loadMessages(conversationGuidId: string): Promise<MessageDto[]> {
      const api = conversationApi()
      const detail = await api.get(conversationGuidId)
      return detail.messages
    },

    addOrUpdateConversation(conv: ConversationDto) {
      const idx = this.conversations.findIndex(c => c.id === conv.id)
      if (idx >= 0) {
        this.conversations[idx] = conv
      } else {
        this.conversations.unshift(conv)
      }
    },

    setPendingMessage(message: string | null) {
      this.pendingMessage = message
    },

    setPendingFiles(files: ChatFileAttachment[]) {
      this.pendingFiles = files
    },

    consumePendingMessage(): string | null {
      const msg = this.pendingMessage
      this.pendingMessage = null
      return msg
    },

    consumePendingFiles(): ChatFileAttachment[] {
      const f = [...this.pendingFiles]
      this.pendingFiles = []
      return f
    }
  }
})

/**
 * 解析 contentJson 提取 FunctionCallContent / FunctionResultContent。
 */
function parseContentJson(json: string): Array<{ $type: string, [key: string]: unknown }> {
  if (!json || json === '{}' || json === '[]') return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/**
 * 将后端 MessageDto 列表转换为前端 UIMessage 列表。
 * 支持从历史消息中重建工具调用 parts。
 */
export function messageDtosToUIMessages(msgs: MessageDto[]): UIMessage[] {
  const result: UIMessage[] = []

  for (let i = 0; i < msgs.length; i++) {
    const msg = msgs[i]!

    if (msg.role === 'user') {
      result.push({
        id: msg.messageId || msg.id,
        role: 'user',
        parts: [{ type: 'text' as const, text: msg.content }]
      })
      continue
    }

    if (msg.role === 'assistant') {
      const parts: Array<Record<string, unknown>> = []
      const contents = parseContentJson(msg.contentJson)

      // 检查是否包含 FunctionCallContent（注意：后端 System.Text.Json 序列化为 PascalCase）
      const funcCalls = contents.filter(c => c.$type === 'functionCall')

      if (funcCalls.length > 0) {
        for (const fc of funcCalls) {
          const callId = (fc.CallId as string) || (fc.callId as string) || `tc-${i}`
          const toolName = (fc.Name as string) || (fc.name as string) || 'unknown'
          let args: Record<string, unknown> = {}
          const rawArgs = fc.Arguments || fc.arguments
          if (rawArgs && typeof rawArgs === 'object') {
            args = rawArgs as Record<string, unknown>
          }

          // 查找后续 tool 消息中对应的 result
          let toolResult: unknown = undefined
          for (let j = i + 1; j < msgs.length; j++) {
            const next = msgs[j]!
            if (next.role === 'tool') {
              const nextContents = parseContentJson(next.contentJson)
              const matched = nextContents.find(
                c => c.$type === 'functionResult'
                  && ((c.CallId as string) === callId || (c.callId as string) === callId)
              )
              if (matched) {
                toolResult = matched.Result ?? matched.result ?? next.content
                break
              }
              if (nextContents.length === 0 && next.content) {
                toolResult = next.content
                break
              }
            } else if (next.role === 'user') {
              break
            }
          }

          parts.push({
            type: 'tool-invocation',
            toolName,
            toolCallId: callId,
            args,
            result: toolResult,
            state: 'completed'
          })
        }

        if (msg.content && msg.content.trim()) {
          parts.push({ type: 'text', text: msg.content })
        }
      } else {
        // 普通 assistant 文本消息；检查前面的工具调用是否需要合并
        // 如果前一条消息是 tool（表示是同一轮对话的最终回复），
        // 且 result 列表最后一条已经有工具调用，则合并
        const lastResult = result[result.length - 1]
        if (
          lastResult
          && lastResult.role === 'assistant'
          && lastResult.parts.some((p: Record<string, unknown>) => p.type === 'tool-invocation')
        ) {
          // 合并文本到上一个 assistant message
          if (msg.content && msg.content.trim()) {
            (lastResult.parts as Array<Record<string, unknown>>).push({ type: 'text', text: msg.content })
          }
          // 更新 id 为最后的 assistant message id
          lastResult.id = msg.messageId || msg.id
          continue
        }

        if (msg.content && msg.content.trim()) {
          parts.push({ type: 'text', text: msg.content })
        }
      }

      if (parts.length > 0) {
        result.push({
          id: msg.messageId || msg.id,
          role: 'assistant',
          parts: parts as UIMessage['parts']
        })
      }
      continue
    }

    // role === 'tool': 跳过，已在 assistant 处理中被消费
  }

  return result
}

/**
 * @deprecated 使用 messageDtosToUIMessages 代替
 */
export function messageDtoToUIMessage(msg: MessageDto): UIMessage {
  return {
    id: msg.messageId || msg.id,
    role: (msg.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
    parts: [{ type: 'text' as const, text: msg.content }]
  }
}
