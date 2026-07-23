import { Button, Result } from 'antd'
import { useNavigate } from 'react-router-dom'

export function ForbiddenPage() {
  const navigate = useNavigate()

  return (
    <Result
      status="403"
      title="403"
      subTitle="无权限访问"
      extra={
        <Button type="primary" onClick={() => navigate('/dashboard', { replace: true })}>
          返回首页
        </Button>
      }
    />
  )
}
