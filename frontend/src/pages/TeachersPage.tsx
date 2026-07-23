import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

import { getApiErrorMessage } from '../api/errors'
import { listTeachers, updateTeacherStatus } from '../api/teachers'
import { RoleTags } from '../components/RoleTags'
import { StatusTag } from '../components/StatusTag'
import { TeacherFormModal } from '../components/teachers/TeacherFormModal'
import type { RecordStatus } from '../types/common'
import type { Teacher, TeacherListParams } from '../types/teacher'
import { formatDateTime } from '../utils/dateTime'

interface TeacherSearchValues {
  keyword?: string
  status?: RecordStatus
}

const DEFAULT_PAGE_SIZE = 10

export function TeachersPage() {
  const { message } = App.useApp()
  const [searchForm] = Form.useForm<TeacherSearchValues>()
  const [items, setItems] = useState<Teacher[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [query, setQuery] = useState<TeacherListParams>({
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [editingTeacher, setEditingTeacher] = useState<Teacher | null>(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null)
  const requestIdRef = useRef(0)

  const loadTeachers = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setListError(null)
    try {
      const response = await listTeachers(query)
      if (requestId === requestIdRef.current) {
        setItems(response.items)
        setTotal(response.total)
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setItems([])
        setTotal(0)
        setListError(getApiErrorMessage(error, '教师列表加载失败'))
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [query])

  useEffect(() => {
    void loadTeachers()
  }, [loadTeachers])

  const handleSaved = (_teacher: Teacher, mode: 'create' | 'edit') => {
    setModalOpen(false)
    setEditingTeacher(null)
    void message.success(mode === 'create' ? '教师新增成功' : '教师保存成功')
    if (query.page === 1) {
      void loadTeachers()
    } else {
      setQuery((current) => ({ ...current, page: 1 }))
    }
  }

  const handleStatusUpdate = async (teacher: Teacher) => {
    const nextStatus: RecordStatus = teacher.status === 'active' ? 'disabled' : 'active'
    setStatusUpdatingId(teacher.id)
    try {
      await updateTeacherStatus(teacher.id, nextStatus)
      void message.success(nextStatus === 'active' ? '教师已启用' : '教师已禁用')
      await loadTeachers()
    } catch (error) {
      void message.error(getApiErrorMessage(error, '教师状态更新失败'))
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const columns: TableColumnsType<Teacher> = [
    { title: '用户名', dataIndex: 'username', width: 170 },
    { title: '姓名', dataIndex: 'real_name', width: 150 },
    {
      title: '角色',
      dataIndex: 'roles',
      width: 120,
      render: (roles: Teacher['roles']) => <RoleTags roles={roles} />,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: RecordStatus) => <StatusTag status={status} />,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '更新时间',
      dataIndex: 'updated_at',
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 150,
      render: (_, teacher) => {
        const actionLabel = teacher.status === 'active' ? '禁用' : '启用'
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              aria-label={`编辑教师 ${teacher.real_name}`}
              data-e2e={`edit-teacher-${teacher.id}`}
              onClick={() => {
                setEditingTeacher(teacher)
                setModalOpen(true)
              }}
            >
              编辑
            </Button>
            <Popconfirm
              title={`确认${actionLabel}“${teacher.real_name}”教师吗？`}
              okText="确认"
              cancelText="取消"
              onConfirm={() => handleStatusUpdate(teacher)}
            >
              <Button
                type="link"
                size="small"
                danger={teacher.status === 'active'}
                loading={statusUpdatingId === teacher.id}
                aria-label={`${actionLabel}教师 ${teacher.real_name}`}
                data-e2e={`status-teacher-${teacher.id}`}
              >
                {actionLabel}
              </Button>
            </Popconfirm>
          </Space>
        )
      },
    },
  ]

  return (
    <div className="management-page">
      <div className="management-page-header">
        <div>
          <Typography.Title level={3}>教师管理</Typography.Title>
          <Typography.Text type="secondary">维护教师登录账号及启用状态</Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          data-e2e="create-teacher"
          onClick={() => {
            setEditingTeacher(null)
            setModalOpen(true)
          }}
        >
          新增教师
        </Button>
      </div>

      <Card className="filter-card" size="small">
        <Form<TeacherSearchValues>
          form={searchForm}
          className="filter-form"
          layout="inline"
          onFinish={(values) => {
            setQuery((current) => ({
              page: 1,
              page_size: current.page_size,
              keyword: values.keyword?.trim() || undefined,
              status: values.status,
            }))
          }}
        >
          <Form.Item label="关键词" name="keyword">
            <Input
              allowClear
              placeholder="用户名或姓名"
              maxLength={100}
              data-e2e="teacher-keyword"
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
              data-e2e="teacher-status-filter"
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
              <Button icon={<ReloadOutlined />} onClick={() => void loadTeachers()}>
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
            <Button size="small" onClick={() => void loadTeachers()}>
              重试
            </Button>
          }
        />
      )}

      <Card className="table-card" variant="borderless">
        <Table<Teacher>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={isLoading}
          scroll={{ x: 1050 }}
          locale={{ emptyText: '暂无教师数据' }}
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

      <TeacherFormModal
        open={modalOpen}
        teacher={editingTeacher}
        onCancel={() => {
          setModalOpen(false)
          setEditingTeacher(null)
        }}
        onSaved={handleSaved}
      />
    </div>
  )
}
