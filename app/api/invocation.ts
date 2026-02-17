import type { InvocationTokenInfo, ConversationInvocationInfo } from '~~/shared/types/api'
import { apiFetch } from './client'

export function invocationApi() {
  return {
    async getByMessageId(messageId: string): Promise<InvocationTokenInfo | null> {
      try {
        return await apiFetch<InvocationTokenInfo>(`/api/invocation/by-message/${messageId}`)
      } catch {
        return null
      }
    },

    async getAllByConversationId(conversationExternalId: string): Promise<ConversationInvocationInfo[]> {
      try {
        return await apiFetch<ConversationInvocationInfo[]>(`/api/invocation/by-conversation/${conversationExternalId}`)
      } catch {
        return []
      }
    }
  }
}
