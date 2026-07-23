import { ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import { Alert, Button, Card, Form, Input, Select, Space, Table, Typography } from 'antd'
import type { TableColumnsType } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getApiErrorMessage } from '../api/errors'
import { listUsers } from '../api/users'
import { RoleTags } from '../components/RoleTags'
import { StatusTag } from '../components/StatusTag'
import type { RoleCode } from '../types/auth'
import type { RecordStatus } from '../types/common'
import type { UserInfo, UserListParams } from '../types/user'
import { formatDateTime } from '../utils/dateTime'

interface UserSearchValues {
  keyword?: string
  role?: RoleCode
  status?: RecordStatus
}

const DEFAULT_PAGE_SIZE = 10

export function UsersPage() {
  const [searchForm] = Form.useForm<UserSearchValues>()
  const [items, setItems] = useState<UserInfo[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [query, setQuery] = useState<UserListParams>({
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
  })
  const requestIdRef = useRef(0)

  const loadUsers = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setListError(null)
    try {
      const response = await listUsers(query)
      if (requestId === requestIdRef.current) {
        setItems(response.items)
        setTotal(response.total)
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setItems([])
        setTotal(0)
        setListError(getApiErrorMessage(error, '用户列表加载失败'))
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [query])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  const columns: TableColumnsType<UserInfo> = [
    { title: '用户名', dataIndex: 'username', width: 190 },
    { title: '姓名', dataIndex: 'real_name', width: 160 },
    {
      title: '角色',
      dataIndex: 'roles',
      render: (roles: UserInfo['roles']) => <RoleTags roles={roles} />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: RecordStatus) => <StatusTag status={status} />,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 180,
      render: (value: string) => formatDateTime(value),
    },
  ]

  return (
    <div className="management-page">
      <div className="management-page-header">
        <div>
          <Typography.Title level={3}>用户管理</Typography.Title>
          <Typography.Text type="secondary">
            只读查询全部账号；教师和学生请在对应管理页面维护
          </Typography.Text>
        </div>
      </div>

      <Card className="filter-card" size="small">
        <Form<UserSearchValues>
          form={searchForm}
          className="filter-form"
          layout="inline"
          onFinish={(values) => {
            setQuery((current) => ({
              page: 1,
              page_size: current.page_size,
              keyword: values.keyword?.trim() || undefined,
              role: values.role,
              status: values.status,
            }))
          }}
        >
          <Form.Item label="关键词" name="keyword">
            <Input
              allowClear
              placeholder="用户名或姓名"
              maxLength={100}
              data-e2e="user-keyword"
            />
          </Form.Item>
          <Form.Item label="角色" name="role">
            <Select
              allowClear
              placeholder="全部角色"
              options={[
                { value: 'admin', label: '管理员' },
                { value: 'teacher', label: '教师' },
                { value: 'student', label: '学生' },
              ]}
              data-e2e="user-role-filter"
            />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select
              allowClear
              placeholder="全部状态"
              options={[
                { value: 'active', label: '启用' },
                { value: 'disabled', label: '禁用' },
              ]}
              data-e2e="user-status-filter"
            />
          </Form.Item>
          <Form.Item className="filter-actions">
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                查询
              </Button>
              <Button
                onClick={() => {
                  searchForm.resetFields()
                  setQuery((current) => ({ page: 1, page_size: current.page_size }))
                }}
              >
                重置
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => void loadUsers()}>
                刷新
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {listError !== null && (
        <Alert
          className="list-error-alert"
          type="error"
          showIcon
          message={listError}
          action={
            <Button size="small" onClick={() => void loadUsers()}>
              重试
            </Button>
          }
        />
      )}

      <Card className="table-card" variant="borderless">
        <Table<UserInfo>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={isLoading}
          scroll={{ x: 940 }}
          locale={{ emptyText: '暂无用户数据' }}
          pagination={{
            current: query.page,
            pageSize: query.page_size,
            total,
            showSizeChanger: true,
            pageSizeOptions: [10, 20, 50, 100],
            showTotal: (count) => `共 ${count} 条`,
            onChange: (page, pageSize) => {
              setQuery((current) => ({
                ...current,
                page: pageSize === current.page_size ? page : 1,
                page_size: pageSize,
              }))
            },
          }}
        />
      </Card>
    </div>
  )
}
