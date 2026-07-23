import { LockOutlined, UserOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Typography } from 'antd'
import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { getLoginErrorMessage } from '../api/auth'
import { useAuthStore } from '../stores/authStore'
import type { LoginRequest } from '../types/auth'

interface LoginLocationState {
  from?: {
    pathname?: string
  }
}

export function LoginPage() {
  const login = useAuthStore((state) => state.login)
  const navigate = useNavigate()
  const location = useLocation()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)

  const handleLogin = async (values: LoginRequest) => {
    if (isSubmitting) {
      return
    }

    setIsSubmitting(true)
    setLoginError(null)

    try {
      await login(values)
      const locationState = location.state as LoginLocationState | null
      const destination = locationState?.from?.pathname ?? '/dashboard'
      navigate(destination === '/login' ? '/dashboard' : destination, { replace: true })
    } catch (error) {
      setLoginError(getLoginErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-page">
      <section className="login-introduction" aria-label="系统介绍">
        <Typography.Text className="login-eyebrow">VOCATIONAL EDUCATION</Typography.Text>
        <Typography.Title className="login-system-title">在线考试系统</Typography.Title>
        <Typography.Paragraph className="login-description">
          面向职业教育场景的考试管理平台
        </Typography.Paragraph>
      </section>

      <Card className="login-card" variant="borderless">
        <div className="login-card-heading">
          <Typography.Title level={3}>欢迎登录</Typography.Title>
          <Typography.Text type="secondary">请使用系统账号进入管理平台</Typography.Text>
        </div>

        {loginError !== null && (
          <Alert className="login-alert" type="error" showIcon message={loginError} />
        )}

        <Form<LoginRequest>
          layout="vertical"
          requiredMark={false}
          onFinish={handleLogin}
          autoComplete="on"
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, whitespace: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="请输入用户名"
              size="large"
              autoComplete="username"
              maxLength={50}
            />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入密码"
              size="large"
              autoComplete="current-password"
            />
          </Form.Item>

          <Button
            className="login-submit"
            type="primary"
            htmlType="submit"
            size="large"
            loading={isSubmitting}
            disabled={isSubmitting}
            block
          >
            登录
          </Button>
        </Form>
      </Card>
    </main>
  )
}
