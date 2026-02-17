import type { TokenResponse } from '~~/shared/types/api'
import { useAuthStore } from '~/stores/auth'

let refreshPromise: Promise<TokenResponse | null> | null = null

function getStoredTokens() {
  const raw = localStorage.getItem('auth')
  if (!raw) return null
  try {
    return JSON.parse(raw) as { accessToken: string, refreshToken: string }
  } catch {
    return null
  }
}

function setStoredTokens(tokens: { accessToken: string, refreshToken: string }) {
  const raw = localStorage.getItem('auth')
  const existing = raw ? JSON.parse(raw) : {}
  localStorage.setItem('auth', JSON.stringify({ ...existing, ...tokens }))
}

async function doRefresh(apiBase: string, refreshToken: string): Promise<TokenResponse | null> {
  try {
    const res = await fetch(`${apiBase}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken })
    })
    if (!res.ok) return null
    return await res.json() as TokenResponse
  } catch {
    return null
  }
}

function handleAuthFailure() {
  localStorage.removeItem('auth')
  try {
    const authStore = useAuthStore()
    authStore.$reset()
  } catch {
    // Pinia 可能未初始化，静默处理
  }
  navigateTo('/login')
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { noAuth?: boolean } = {}
): Promise<T> {
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase as string
  const url = `${apiBase}${path}`

  const headers = new Headers(options.headers)
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json')
  }

  if (!options.noAuth) {
    const tokens = getStoredTokens()
    if (tokens?.accessToken) {
      headers.set('Authorization', `Bearer ${tokens.accessToken}`)
    }
  }

  let res = await fetch(url, { ...options, headers })

  if (res.status === 401 && !options.noAuth) {
    const tokens = getStoredTokens()
    if (tokens?.refreshToken) {
      if (!refreshPromise) {
        refreshPromise = doRefresh(apiBase, tokens.refreshToken).finally(() => {
          refreshPromise = null
        })
      }
      const newTokens = await refreshPromise
      if (newTokens) {
        setStoredTokens({
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken
        })
        headers.set('Authorization', `Bearer ${newTokens.accessToken}`)
        res = await fetch(url, { ...options, headers })
      } else {
        handleAuthFailure()
        throw new Error('认证已过期，请重新登录')
      }
    } else {
      handleAuthFailure()
      throw new Error('未登录')
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as Record<string, string>).error || `请求失败 (${res.status})`)
  }

  return res.json() as Promise<T>
}

export function apiStreamFetch(
  path: string,
  body: Record<string, unknown>
): { response: Promise<Response>, abort: () => void } {
  const config = useRuntimeConfig()
  const apiBase = config.public.apiBase as string
  const url = `${apiBase}${path}`

  const controller = new AbortController()

  const makeRequest = (accessToken?: string): Promise<Response> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream'
    }
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`
    }
    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    })
  }

  const response = (async (): Promise<Response> => {
    const tokens = getStoredTokens()
    let res = await makeRequest(tokens?.accessToken)

    if (res.status === 401 && tokens?.refreshToken) {
      if (!refreshPromise) {
        refreshPromise = doRefresh(apiBase, tokens.refreshToken).finally(() => {
          refreshPromise = null
        })
      }
      const newTokens = await refreshPromise
      if (newTokens) {
        setStoredTokens({
          accessToken: newTokens.accessToken,
          refreshToken: newTokens.refreshToken
        })
        res = await makeRequest(newTokens.accessToken)
      } else {
        handleAuthFailure()
      }
    }

    return res
  })()

  return {
    response,
    abort: () => controller.abort()
  }
}
