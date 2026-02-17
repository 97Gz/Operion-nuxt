import { apiFetch } from '~/api/client'

const cache = ref<Record<string, string>>({})
const loaded = ref(false)

export function useToolNames() {
  async function fetchToolNames() {
    if (loaded.value) return
    try {
      const map = await apiFetch<Record<string, string>>('/api/tools/names')
      cache.value = map
      loaded.value = true
    } catch {
      // 静默处理
    }
  }

  function resolve(methodName: string): string {
    return cache.value[methodName] || methodName
  }

  if (!loaded.value) {
    fetchToolNames()
  }

  return { toolNames: cache, resolve, fetchToolNames }
}
