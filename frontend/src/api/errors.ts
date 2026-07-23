import axios from 'axios'

import type { ApiErrorResponse } from '../types/auth'

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError<ApiErrorResponse>(error)) {
    return fallback
  }

  if (error.response === undefined) {
    return '无法连接服务器，请检查网络后重试'
  }

  if (error.response.status === 401) {
    return '登录状态已失效，请重新登录'
  }

  if (error.response.status === 403) {
    return '没有权限执行此操作'
  }

  const detail = error.response.data?.detail
  if (
    error.response.status >= 400 &&
    error.response.status < 500 &&
    typeof detail === 'string' &&
    detail.trim() !== ''
  ) {
    return detail
  }

  return fallback
}
