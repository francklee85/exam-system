import {
  ApartmentOutlined,
  BankOutlined,
  BarChartOutlined,
  CalendarOutlined,
  DashboardOutlined,
  FileTextOutlined,
  FormOutlined,
  QuestionCircleOutlined,
  SolutionOutlined,
  TeamOutlined,
  TrophyOutlined,
  UserOutlined,
} from '@ant-design/icons'
import { Button, Layout, Menu, Space, Tag, Typography } from 'antd'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'

import { getNavigationItems } from '../app/navigation'
import { useAuthStore } from '../stores/authStore'
import { getRoleLabels } from '../utils/roles'

const { Header, Sider, Content } = Layout

const navigationIcons: Record<string, ReactNode> = {
  dashboard: <DashboardOutlined />,
  users: <UserOutlined />,
  teachers: <SolutionOutlined />,
  students: <TeamOutlined />,
  majors: <ApartmentOutlined />,
  classes: <BankOutlined />,
  questions: <QuestionCircleOutlined />,
  papers: <FileTextOutlined />,
  exams: <CalendarOutlined />,
  results: <BarChartOutlined />,
  'my-exams': <FormOutlined />,
  'my-results': <TrophyOutlined />,
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const currentUser = useAuthStore((state) => state.currentUser)
  const roles = useAuthStore((state) => state.roles)
  const logout = useAuthStore((state) => state.logout)

  const availableNavigation = useMemo(() => getNavigationItems(roles), [roles])
  const selectedMenuKey =
    (location.pathname.startsWith('/attempts/')
      ? availableNavigation.find((item) => item.key === 'my-exams')
      : availableNavigation.find(
          (item) =>
            location.pathname === item.path ||
            location.pathname.startsWith(`${item.path}/`),
        ))?.key ?? 'dashboard'

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <Layout className="app-layout">
      <Sider
        className="app-sider"
        collapsible
        collapsed={collapsed}
        onCollapse={setCollapsed}
        breakpoint="lg"
      >
        <button
          className="app-brand"
          type="button"
          onClick={() => navigate('/dashboard')}
          aria-label="返回 Dashboard"
        >
          <span className="app-brand-mark">考</span>
          {!collapsed && <span className="app-brand-name">在线考试系统</span>}
        </button>

        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedMenuKey]}
          items={availableNavigation.map((item) => ({
            key: item.key,
            icon: navigationIcons[item.key],
            label: item.label,
          }))}
          onClick={({ key }) => {
            const item = availableNavigation.find((navigation) => navigation.key === key)
            if (item !== undefined) {
              navigate(item.path)
            }
          }}
        />
      </Sider>

      <Layout>
        <Header className="app-header">
          <Typography.Text className="header-system-name">职业教育考试管理平台</Typography.Text>
          <Space className="header-user" size="middle">
            <div className="header-user-details">
              <Typography.Text strong>{currentUser?.realName}</Typography.Text>
              <Space size={4} wrap>
                {getRoleLabels(roles).map((label) => (
                  <Tag className="header-role-tag" color="blue" key={label}>
                    {label}
                  </Tag>
                ))}
              </Space>
            </div>
            <Button onClick={handleLogout}>退出登录</Button>
          </Space>
        </Header>

        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  )
}
