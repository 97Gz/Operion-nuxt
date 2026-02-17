<script setup lang="ts">
export interface ToolInvocationPart {
  type: 'tool-invocation'
  toolName: string
  toolDisplayName?: string
  toolCallId: string
  args?: Record<string, unknown>
  result?: unknown
  state: 'calling' | 'completed' | 'error'
}

const props = defineProps<{
  invocation: ToolInvocationPart
}>()

const open = ref(false)

const { resolve } = useToolNames()

const displayLabel = computed(() =>
  props.invocation.toolDisplayName || resolve(props.invocation.toolName)
)

const stateLabel = computed(() => {
  switch (props.invocation.state) {
    case 'calling': return '调用中...'
    case 'completed': return '已完成'
    case 'error': return '出错'
    default: return ''
  }
})

const stateColor = computed(() => {
  switch (props.invocation.state) {
    case 'calling': return 'text-blue-500'
    case 'completed': return 'text-green-500'
    case 'error': return 'text-red-500'
    default: return 'text-muted'
  }
})

function formatJson(val: unknown): string {
  if (val == null) return '-'
  if (typeof val === 'string') {
    try {
      return JSON.stringify(JSON.parse(val), null, 2)
    } catch {
      return val
    }
  }
  return JSON.stringify(val, null, 2)
}
</script>

<template>
  <UCollapsible v-model:open="open" class="my-2 rounded-lg border border-default bg-elevated/50">
    <button
      class="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-elevated/80 transition-colors rounded-lg"
    >
      <UIcon name="i-lucide-wrench" class="size-4 shrink-0 text-primary" />
      <span class="font-medium">{{ displayLabel }}</span>
      <span :class="['text-xs ml-auto', stateColor]">{{ stateLabel }}</span>
      <UIcon
        v-if="invocation.state !== 'calling'"
        name="i-lucide-chevron-down"
        class="size-4 shrink-0 text-muted transition-transform duration-200"
        :class="{ 'rotate-180': open }"
      />
      <UIcon
        v-else
        name="i-lucide-loader-2"
        class="size-4 shrink-0 text-blue-500 animate-spin"
      />
    </button>

    <template #content>
      <div class="px-3 pb-3 space-y-2 text-xs">
        <div v-if="invocation.result != null">
          <span class="text-muted font-medium">结果:</span>
          <pre class="mt-1 p-2 rounded bg-default text-muted overflow-x-auto">{{ formatJson(invocation.result) }}</pre>
        </div>
        <div v-else-if="invocation.state === 'calling'">
          <span class="text-muted">等待执行结果...</span>
        </div>
      </div>
    </template>
  </UCollapsible>
</template>
