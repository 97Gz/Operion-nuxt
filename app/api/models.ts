import type { AIModelDto } from '~~/shared/types/api'
import { apiFetch } from './client'

export function modelsApi() {
  return {
    async list(): Promise<AIModelDto[]> {
      return apiFetch<AIModelDto[]>('/api/models', { noAuth: true })
    }
  }
}
