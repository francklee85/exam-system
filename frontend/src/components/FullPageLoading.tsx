import { Flex, Spin, Typography } from 'antd'

export function FullPageLoading() {
  return (
    <Flex className="full-page-loading" vertical align="center" justify="center" gap="middle">
      <Spin size="large" />
      <Typography.Text type="secondary">正在确认登录状态…</Typography.Text>
    </Flex>
  )
}
