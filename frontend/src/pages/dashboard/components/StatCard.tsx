import { Card, Statistic } from 'antd'
import type { ReactNode } from 'react'

interface StatCardProps {
  title: string
  value: number | string
  suffix?: ReactNode
  onClick?: () => void
}

export function StatCard({ title, value, suffix, onClick }: StatCardProps) {
  const isInteractive = onClick !== undefined
  return (
    <Card
      className={`dashboard-stat-card${isInteractive ? ' dashboard-stat-card-link' : ''}`}
      onClick={onClick}
      role={isInteractive ? 'link' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={(event) => {
        if (isInteractive && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault()
          onClick()
        }
      }}
    >
      <Statistic
        title={title}
        value={value}
        suffix={suffix}
        formatter={typeof value === 'string' ? () => value : undefined}
      />
    </Card>
  )
}
