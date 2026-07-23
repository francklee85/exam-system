import axios from 'axios'

import type {
  ApiErrorResponse,
  CurrentUser,
  CurrentUserResponse,
  LoginRequest,
  LoginResponse,
} from '../types/auth'
import { toCurrentUser } from '../types/auth'
import { apiClient } from './http'

export async function loginRequest(payload: LoginRequest): Promise<LoginResponse> {
  const response = await apiClient.post<LoginResponse>('/api/v1/auth/login', payload)
  return response.data
}

export async function currentUserRequest(): Promise<CurrentUser> {
  const response = await apiClient.get<CurrentUserResponse>('/api/v1/auth/me')
  return toCurrentUser(response.data)
}

export function getLoginErrorMessage(error: unknown): string {
  if (!axios.isAxiosError<ApiErrorResponse>(error)) {
    return '登录失败，请稍后重试'
  }

  if (error.response === undefined) {
    return '无法连接服务器，请检查网络后重试'
  }

  if (error.response.status === 401) {
    return '用户名或密码错误'
  }

  if (error.response.status === 422) {
    return '用户名或密码格式不正确'
  }

  return '登录失败，请稍后重试'
}
