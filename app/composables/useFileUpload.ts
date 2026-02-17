import type { ChatFileAttachment } from '~~/shared/types/api'
import { FILE_UPLOAD_CONFIG, fileToBase64 } from '~~/shared/utils/file'
import type { FileWithStatus } from '~~/shared/utils/file'

export function useFileUploadLocal() {
  const files = ref<FileWithStatus[]>([])
  const toast = useToast()

  const isUploading = computed(() =>
    files.value.some(f => f.status === 'uploading')
  )

  const uploadedFiles = computed<ChatFileAttachment[]>(() =>
    files.value
      .filter(f => f.status === 'uploaded' && f.dataUrl)
      .map(f => ({
        mediaType: f.file.type,
        url: f.dataUrl!,
        fileName: f.file.name
      }))
  )

  async function addFiles(newFiles: File[]) {
    const filesWithStatus: FileWithStatus[] = newFiles
      .filter(file => {
        if (file.size > FILE_UPLOAD_CONFIG.maxSize) {
          toast.add({
            title: `文件 ${file.name} 超过 8MB 限制`,
            icon: 'i-lucide-alert-circle',
            color: 'error'
          })
          return false
        }
        return true
      })
      .map(file => ({
        file,
        id: crypto.randomUUID(),
        previewUrl: URL.createObjectURL(file),
        status: 'uploading' as const
      }))

    files.value = [...files.value, ...filesWithStatus]

    await Promise.allSettled(filesWithStatus.map(async (fws) => {
      const idx = files.value.findIndex(f => f.id === fws.id)
      if (idx === -1) return

      try {
        const dataUrl = await fileToBase64(fws.file)
        files.value[idx] = { ...files.value[idx]!, status: 'uploaded', dataUrl }
        files.value = [...files.value] // trigger reactivity
      } catch {
        files.value[idx] = { ...files.value[idx]!, status: 'error', error: '读取文件失败' }
        files.value = [...files.value]
      }
    }))
  }

  function removeFile(id: string) {
    const file = files.value.find(f => f.id === id)
    if (file) {
      URL.revokeObjectURL(file.previewUrl)
    }
    files.value = files.value.filter(f => f.id !== id)
  }

  function clearFiles() {
    files.value.forEach(f => URL.revokeObjectURL(f.previewUrl))
    files.value = []
  }

  onUnmounted(() => {
    clearFiles()
  })

  return {
    files,
    isUploading,
    uploadedFiles,
    addFiles,
    removeFile,
    clearFiles
  }
}
