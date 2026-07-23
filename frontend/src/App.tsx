import { App as AntdApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'

import { router } from './app/router'
import { FullPageLoading } from './components/FullPageLoading'
import { useAuthStore } from './stores/authStore'

export function App() {
  const initializeAuth = useAuthStore((state) => state.initializeAuth)
  const isLoading = useAuthStore((state) => state.isLoading)
  const hasInitialized = useAuthStore((state) => state.hasInitialized)

  useEffect(() => {
    void initializeAuth()
  }, [initializeAuth])

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
          colorBgLayout: '#f4f7fb',
        },
      }}
    >
      <AntdApp>
        {isLoading || !hasInitialized ? <FullPageLoading /> : <RouterProvider router={router} />}
      </AntdApp>
    </ConfigProvider>
  )
}
