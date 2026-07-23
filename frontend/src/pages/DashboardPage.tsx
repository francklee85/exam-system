import { Card, Col, Row, Space, Tag, Typography } from 'antd'

import { useAuthStore } from '../stores/authStore'
import type { RoleCode } from '../types/auth'
import { getRoleLabels } from '../utils/roles'

interface CapabilityCard {
  title: string
  description: string
}

const roleCapabilities: Record<RoleCode, readonly CapabilityCard[]> = {
  admin: [
    { title: '用户管理', description: '维护管理员、教师和学生的基础账号。' },
    { title: '专业班级管理', description: '维护职业教育专业、班级和学生归属。' },
    { title: '考试系统管理', description: '掌握系统基础数据和后续考试运行情况。' },
  ],
  teacher: [
    { title: '题库', description: '维护单选题、多选题和判断题。' },
    { title: '试卷', description: '组织题目并设置试卷题目分值。' },
    { title: '考试', description: '发布考试并设置专业或班级范围。' },
    { title: '成绩', description: '查看学生考试结果和答题情况。' },
  ],
  student: [
    { title: '我的考试', description: '查看可参加的考试和考试安排。' },
    { title: '我的成绩', description: '查看已完成考试的成绩。' },
  ],
}

export function DashboardPage() {
  const currentUser = useAuthStore((state) => state.currentUser)
  const roles = useAuthStore((state) => state.roles)
  const capabilities = roles.flatMap((role) => roleCapabilities[role])

  return (
    <div className="dashboard-page">
      <Card className="dashboard-welcome" variant="borderless">
        <Typography.Text className="dashboard-kicker">DASHBOARD</Typography.Text>
        <Typography.Title level={2}>欢迎，{currentUser?.realName ?? '用户'}</Typography.Title>
        <Space size={[8, 8]} wrap>
          <Typography.Text type="secondary">当前角色</Typography.Text>
          {getRoleLabels(roles).map((label) => (
            <Tag color="blue" key={label}>
              {label}
            </Tag>
          ))}
        </Space>
      </Card>

      <div className="dashboard-section-heading">
        <Typography.Title level={4}>工作概览</Typography.Title>
        <Typography.Text type="secondary">功能入口将随业务模块逐步开放</Typography.Text>
      </div>

      <Row gutter={[16, 16]}>
        {capabilities.map((capability, index) => (
          <Col xs={24} md={12} xl={8} key={`${capability.title}-${index}`}>
            <Card className="capability-card" title={capability.title}>
              <Typography.Paragraph type="secondary">
                {capability.description}
              </Typography.Paragraph>
              <Tag>规划中</Tag>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  )
}
