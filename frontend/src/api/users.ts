import type { PaginationResponse } from '../types/common'
import type { UserInfo, UserListParams } from '../types/user'
import { apiClient } from './http'

const USERS_PATH = '/api/v1/users'

export async function listUsers(
  params: UserListParams,
): Promise<PaginationResponse<UserInfo>> {
  const response = await apiClient.get<PaginationResponse<UserInfo>>(USERS_PATH, { params })
  return response.data
}
