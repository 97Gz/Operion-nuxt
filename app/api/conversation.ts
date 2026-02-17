import type { ConversationDetailDto, ConversationDto } from '~~/shared/types/api'
import { apiFetch } from './client'

export function conversationApi() {
  return {
    list(skip = 0, take = 50) {
      return apiFetch<ConversationDto[]>(`/api/conversation?skip=${skip}&take=${take}`)
    },

    get(id: string) {
      return apiFetch<ConversationDetailDto>(`/api/conversation/${id}`)
    },

    create(title: string) {
      return apiFetch<ConversationDto>('/api/conversation', {
        method: 'POST',
        body: JSON.stringify({ title })
      })
    },

    update(id: string, title: string) {
      return apiFetch<ConversationDto>(`/api/conversation/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ title })
      })
    },

    delete(id: string) {
      return apiFetch<void>(`/api/conversation/${id}`, {
        method: 'DELETE'
      }).catch(() => {})
    }
  }
}
