import { Button, Result } from 'antd'
import { useNavigate } from 'react-router-dom'

interface ComingSoonPageProps {
  title: string
  description: string
}

export function ComingSoonPage({ title, description }: ComingSoonPageProps) {
  const navigate = useNavigate()

  return (
    <Result
      status="info"
      title={title}
      subTitle={description}
      extra={
        <Button type="primary" onClick={() => navigate('/dashboard')}>
          返回 Dashboard
        </Button>
      }
    />
  )
}
