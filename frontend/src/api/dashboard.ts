import type { DashboardData } from '../types/dashboard'
import { apiClient } from './http'

export async function getDashboard(): Promise<DashboardData> {
  const response = await apiClient.get<DashboardData>('/api/v1/dashboard')
  return response.data
}
