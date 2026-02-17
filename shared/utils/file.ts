export interface FileWithStatus {
  file: File
  id: string
  previewUrl: string
  status: 'uploading' | 'uploaded' | 'error'
  dataUrl?: string
  error?: string
}

export const FILE_UPLOAD_CONFIG = {
  maxSize: 8 * 1024 * 1024, // 8MB
  types: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf', 'text/csv'],
  acceptPattern: 'image/*,application/pdf,.csv,text/csv'
} as const

export function getFileIcon(mimeType: string, fileName?: string): string {
  if (mimeType.startsWith('image/')) return 'i-lucide-image'
  if (mimeType === 'application/pdf') return 'i-lucide-file-text'
  if (mimeType === 'text/csv' || fileName?.endsWith('.csv')) return 'i-lucide-file-spreadsheet'
  return 'i-lucide-file'
}

export function removeRandomSuffix(filename: string): string {
  return filename.replace(/^(.+)-[a-zA-Z0-9]+(\.[^.]+)$/, '$1$2')
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
