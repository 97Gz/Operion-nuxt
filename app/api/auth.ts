import type { LoginRequest, RegisterRequest, TokenResponse, UserInfo } from '~~/shared/types/api'
import { apiFetch } from './client'

export function authApi() {
  return {
    login(data: LoginRequest) {
      return apiFetch<TokenResponse>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(data),
        noAuth: true
      })
    },

    register(data: RegisterRequest) {
      return apiFetch<TokenResponse>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
        noAuth: true
      })
    },

    refresh(refreshToken: string) {
      return apiFetch<TokenResponse>('/api/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
        noAuth: true
      })
    },

    logout(refreshToken: string) {
      return apiFetch<{ message: string }>('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken })
      })
    },

    me() {
      return apiFetch<UserInfo>('/api/auth/me')
    }
  }
}
