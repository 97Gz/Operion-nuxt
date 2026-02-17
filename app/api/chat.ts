import type { ChatStreamPacket, ChatFileAttachment } from '~~/shared/types/api'
import { apiStreamFetch } from './client'

export interface StreamChatOptions {
  message: string
  conversationId?: string | null
  agentName?: string | null
  modelId?: string | null
  files?: ChatFileAttachment[]
  onStarted?: (packet: ChatStreamPacket) => void
  onDelta?: (packet: ChatStreamPacket) => void
  onCompleted?: (packet: ChatStreamPacket) => void
  onError?: (packet: ChatStreamPacket) => void
}

function parseSSELine(line: string): ChatStreamPacket | null {
  if (!line.startsWith('data:')) return null
  const json = line.slice(5).trim()
  if (!json || json === '[DONE]') return null
  try {
    return JSON.parse(json) as ChatStreamPacket
  } catch {
    return null
  }
}

export function chatApi() {
  return {
    streamChat(options: StreamChatOptions) {
      const body: Record<string, unknown> = {
        message: options.message,
        conversationId: options.conversationId ?? null,
        agentName: options.agentName ?? null,
        modelId: options.modelId ?? null
      }

      if (options.files && options.files.length > 0) {
        body.files = options.files
      }

      const { response, abort } = apiStreamFetch('/api/chat/stream', body)

      const promise = (async () => {
        const res = await response
        if (!res.ok) {
          const respBody = await res.json().catch(() => ({}))
          const errorMsg = (respBody as Record<string, string>).error || `请求失败 (${res.status})`
          options.onError?.({
            type: 'error',
            conversationId: '',
            agentName: '',
            error: errorMsg
          })
          return
        }

        const reader = res.body?.getReader()
        if (!reader) return

        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('event:')) continue

            const packet = parseSSELine(trimmed)
            if (!packet) continue

            switch (packet.type) {
              case 'started':
                options.onStarted?.(packet)
                break
              case 'delta':
                options.onDelta?.(packet)
                break
              case 'completed':
                options.onCompleted?.(packet)
                break
              case 'error':
                options.onError?.(packet)
                break
            }
          }
        }

        if (buffer.trim()) {
          const packet = parseSSELine(buffer.trim())
          if (packet) {
            switch (packet.type) {
              case 'completed':
                options.onCompleted?.(packet)
                break
              case 'error':
                options.onError?.(packet)
                break
            }
          }
        }
      })()

      return { promise, abort }
    }
  }
}
