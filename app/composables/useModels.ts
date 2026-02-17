import type { AIModelDto } from '~~/shared/types/api'
import { modelsApi } from '~/api/models'

const modelsCache = ref<AIModelDto[]>([])
const loaded = ref(false)

export function useModels() {
  const model = useCookie<string>('selected-model', { default: () => '' })

  async function fetchModels() {
    if (loaded.value && modelsCache.value.length > 0) return
    try {
      const api = modelsApi()
      modelsCache.value = await api.list()
      loaded.value = true

      // 如果没有选中模型，使用默认模型
      if (!model.value) {
        const defaultModel = modelsCache.value.find(m => m.default) || modelsCache.value[0]
        if (defaultModel) {
          model.value = defaultModel.modelId
        }
      }
    } catch {
      // 静默处理：模型列表加载失败不影响主流程
    }
  }

  const models = computed(() => modelsCache.value)

  const currentModel = computed(() =>
    modelsCache.value.find(m => m.modelId === model.value) || modelsCache.value[0]
  )

  // 自动加载
  if (!loaded.value) {
    fetchModels()
  }

  return {
    models,
    model,
    currentModel,
    fetchModels
  }
}
