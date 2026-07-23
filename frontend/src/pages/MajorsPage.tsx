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
import { listMajors, updateMajorStatus } from '../api/majors'
import { MajorFormModal } from '../components/majors/MajorFormModal'
import { StatusTag } from '../components/StatusTag'
import type { RecordStatus } from '../types/common'
import type { Major, MajorListParams } from '../types/major'
import { formatDateTime } from '../utils/dateTime'

interface MajorSearchValues {
  keyword?: string
  status?: RecordStatus
}

const DEFAULT_PAGE_SIZE = 10

export function MajorsPage() {
  const { message } = App.useApp()
  const [searchForm] = Form.useForm<MajorSearchValues>()
  const [items, setItems] = useState<Major[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [query, setQuery] = useState<MajorListParams>({
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMajor, setEditingMajor] = useState<Major | null>(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null)
  const requestIdRef = useRef(0)

  const loadMajors = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setListError(null)
    try {
      const response = await listMajors(query)
      if (requestId === requestIdRef.current) {
        setItems(response.items)
        setTotal(response.total)
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setItems([])
        setTotal(0)
        setListError(getApiErrorMessage(error, '专业列表加载失败'))
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [query])

  useEffect(() => {
    void loadMajors()
  }, [loadMajors])

  const handleSearch = (values: MajorSearchValues) => {
    setQuery((current) => ({
      page: 1,
      page_size: current.page_size,
      keyword: values.keyword?.trim() || undefined,
      status: values.status,
    }))
  }

  const handleReset = () => {
    searchForm.resetFields()
    setQuery((current) => ({ page: 1, page_size: current.page_size }))
  }

  const handleSaved = (_major: Major, mode: 'create' | 'edit') => {
    setModalOpen(false)
    setEditingMajor(null)
    void message.success(mode === 'create' ? '专业新增成功' : '专业保存成功')
    if (query.page === 1) {
      void loadMajors()
    } else {
      setQuery((current) => ({ ...current, page: 1 }))
    }
  }

  const handleStatusUpdate = async (major: Major) => {
    const nextStatus: RecordStatus = major.status === 'active' ? 'disabled' : 'active'
    setStatusUpdatingId(major.id)
    try {
      await updateMajorStatus(major.id, nextStatus)
      void message.success(nextStatus === 'active' ? '专业已启用' : '专业已禁用')
      await loadMajors()
    } catch (error) {
      void message.error(getApiErrorMessage(error, '专业状态更新失败'))
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const columns: TableColumnsType<Major> = [
    { title: '专业名称', dataIndex: 'name', width: 160 },
    { title: '专业编码', dataIndex: 'code', width: 140 },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      render: (description: string | null) => description || '—',
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
      render: (_, major) => {
        const actionLabel = major.status === 'active' ? '禁用' : '启用'
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              aria-label={`编辑专业 ${major.name}`}
              data-e2e={`edit-major-${major.id}`}
              onClick={() => {
                setEditingMajor(major)
                setModalOpen(true)
              }}
            >
              编辑
            </Button>
            <Popconfirm
              title={`确认${actionLabel}“${major.name}”专业吗？`}
              okText="确认"
              cancelText="取消"
              onConfirm={() => handleStatusUpdate(major)}
            >
              <Button
                type="link"
                size="small"
                danger={major.status === 'active'}
                loading={statusUpdatingId === major.id}
                aria-label={`${actionLabel}专业 ${major.name}`}
                data-e2e={`status-major-${major.id}`}
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
          <Typography.Title level={3}>专业管理</Typography.Title>
          <Typography.Text type="secondary">维护专业基础信息及启用状态</Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          data-e2e="create-major"
          onClick={() => {
            setEditingMajor(null)
            setModalOpen(true)
          }}
        >
          新增专业
        </Button>
      </div>

      <Card className="filter-card" size="small">
        <Form<MajorSearchValues>
          form={searchForm}
          className="filter-form"
          layout="inline"
          onFinish={handleSearch}
        >
          <Form.Item label="关键词" name="keyword">
            <Input
              allowClear
              placeholder="专业名称或编码"
              maxLength={100}
              data-e2e="major-keyword"
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
              data-e2e="major-status-filter"
            />
          </Form.Item>
          <Form.Item className="filter-actions">
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                查询
              </Button>
              <Button onClick={handleReset}>重置</Button>
              <Button icon={<ReloadOutlined />} onClick={() => void loadMajors()}>
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
            <Button size="small" onClick={() => void loadMajors()}>
              重试
            </Button>
          }
        />
      )}

      <Card className="table-card" variant="borderless">
        <Table<Major>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={isLoading}
          scroll={{ x: 1080 }}
          locale={{ emptyText: '暂无专业数据' }}
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

      <MajorFormModal
        open={modalOpen}
        major={editingMajor}
        onCancel={() => {
          if (statusUpdatingId === null) {
            setModalOpen(false)
            setEditingMajor(null)
          }
        }}
        onSaved={handleSaved}
      />
    </div>
  )
}
