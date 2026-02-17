/* ── Auth ────────────────────────────────────── */

export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  email: string
  password: string
}

export interface RefreshTokenRequest {
  refreshToken: string
}

export interface ChangePasswordRequest {
  currentPassword: string
  newPassword: string
}

export interface TokenResponse {
  accessToken: string
  refreshToken: string
  expiresAt: string
  user: UserInfo
}

export interface UserInfo {
  id: string
  username: string
  email: string
}

/* ── Chat ────────────────────────────────────── */

export interface ChatFileAttachment {
  mediaType: string
  url: string
  fileName?: string
}

export interface ChatRequest {
  message: string
  conversationId?: string | null
  agentName?: string | null
  modelId?: string | null
  files?: ChatFileAttachment[]
}

export interface ChatResponse {
  conversationId: string
  agentName: string
  messageId: string
  text: string
}

export interface ChatStreamPacket {
  type: 'started' | 'delta' | 'completed' | 'error'
  conversationId: string
  agentName: string
  messageId?: string
  delta?: string
  text?: string
  error?: string
  modelId?: string
  inputTokens?: number
  outputTokens?: number
}

/* ── Models ──────────────────────────────────── */

export interface AIModelDto {
  modelId: string
  modelName: string
  icon: string
  default: boolean
}

/* ── Invocation (Token Counts) ───────────────── */

export interface InvocationTokenInfo {
  inputTokenCount: number | null
  outputTokenCount: number | null
  totalTokenCount: number | null
  modelId: string | null
  durationMs: number | null
}

export interface ConversationInvocationInfo extends InvocationTokenInfo {
  chatMessageId: string
  chatMessageExternalId: string
}

/* ── Conversation ────────────────────────────── */

export interface ConversationDto {
  id: string
  title: string
  externalConversationId: string
  agentName: string
  channel: string
  lastMessageAt: string | null
  createdAt: string
  updatedAt: string | null
}

export interface ConversationDetailDto extends ConversationDto {
  messages: MessageDto[]
}

export interface MessageDto {
  id: string
  sequence: number
  messageId: string
  role: string
  authorName: string
  source: string
  content: string
  createdAt: string
}

export interface CreateConversationRequest {
  title: string
}

export interface UpdateConversationRequest {
  title: string
}
