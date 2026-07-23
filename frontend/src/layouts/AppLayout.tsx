import { Layout } from 'antd'
import { Outlet } from 'react-router-dom'

const { Content } = Layout

export function AppLayout() {
  return (
    <Layout className="app-layout">
      <Content className="app-content">
        <Outlet />
      </Content>
    </Layout>
  )
}
