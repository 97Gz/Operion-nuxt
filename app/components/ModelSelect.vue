<script setup lang="ts">
const { model, models, currentModel } = useModels()

const items = computed(() => models.value.map(m => ({
  label: m.modelName,
  value: m.modelId,
  icon: m.icon
})))

const selectedIcon = computed(() => currentModel.value?.icon || 'i-lucide-bot')
</script>

<template>
  <USelectMenu
    v-model="model"
    :items="items"
    size="sm"
    :icon="selectedIcon"
    variant="ghost"
    value-key="value"
    class="hover:bg-default focus:bg-default data-[state=open]:bg-default"
    :ui="{
      trailingIcon: 'group-data-[state=open]:rotate-180 transition-transform duration-200'
    }"
  />
</template>
