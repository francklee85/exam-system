import { Alert, Button, Skeleton } from 'antd'
import { useCallback, useEffect, useState } from 'react'

import { getDashboard } from '../api/dashboard'
import { getApiErrorMessage } from '../api/errors'
import { useAuthStore } from '../stores/authStore'
import type { DashboardData } from '../types/dashboard'
import { AdminDashboard } from './dashboard/AdminDashboard'
import { StudentDashboard } from './dashboard/StudentDashboard'
import { TeacherDashboard } from './dashboard/TeacherDashboard'

export function DashboardPage() {
  const currentUser = useAuthStore((state) => state.currentUser)
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setData(await getDashboard())
    } catch (requestError) {
      setData(null)
      setError(getApiErrorMessage(requestError, '工作台加载失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="dashboard-page">
      {loading && (
        <div aria-label="Dashboard 加载中">
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      )}
      {!loading && error !== null && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={<Button onClick={() => void load()}>重试</Button>}
        />
      )}
      {!loading && data?.role === 'admin' && (
        <AdminDashboard
          data={data}
          displayName={currentUser?.realName ?? currentUser?.username ?? '管理员'}
        />
      )}
      {!loading && data?.role === 'teacher' && (
        <TeacherDashboard
          data={data}
          displayName={currentUser?.realName ?? currentUser?.username ?? '教师'}
        />
      )}
      {!loading && data?.role === 'student' && (
        <StudentDashboard
          data={data}
          displayName={currentUser?.realName ?? currentUser?.username ?? '学生'}
          onRefresh={load}
        />
      )}
    </div>
  )
}
