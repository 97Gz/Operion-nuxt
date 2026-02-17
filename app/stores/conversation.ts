import { defineStore } from 'pinia'
import type { UIMessage } from 'ai'
import type { ConversationDto, MessageDto, ChatFileAttachment } from '~~/shared/types/api'
import { conversationApi } from '~/api/conversation'

interface ConversationState {
  conversations: ConversationDto[]
  loading: boolean
  pendingMessage: string | null
  pendingFiles: ChatFileAttachment[]
}

export const useConversationStore = defineStore('conversation', {
  state: (): ConversationState => ({
    conversations: [],
    loading: false,
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
        this.conversations = await api.list()
      } catch {
        this.conversations = []
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

export function messageDtoToUIMessage(msg: MessageDto): UIMessage {
  return {
    id: msg.messageId || msg.id,
    role: (msg.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
    parts: [{ type: 'text' as const, text: msg.content }]
  }
}
