import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'

import { listClasses, updateClassStatus } from '../api/classes'
import { getApiErrorMessage } from '../api/errors'
import { ClassFormModal } from '../components/classes/ClassFormModal'
import { StatusTag } from '../components/StatusTag'
import { useMajorOptions } from '../hooks/useMajorOptions'
import type { ClassInfo, ClassListParams } from '../types/class'
import type { RecordStatus } from '../types/common'
import { formatDateTime } from '../utils/dateTime'

interface ClassSearchValues {
  keyword?: string
  major_id?: number
  enrollment_year?: number
  status?: RecordStatus
}

const DEFAULT_PAGE_SIZE = 10

export function ClassesPage() {
  const { message } = App.useApp()
  const [searchForm] = Form.useForm<ClassSearchValues>()
  const [items, setItems] = useState<ClassInfo[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [query, setQuery] = useState<ClassListParams>({
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [editingClass, setEditingClass] = useState<ClassInfo | null>(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null)
  const requestIdRef = useRef(0)
  const allMajorOptions = useMajorOptions()
  const activeMajorOptions = useMajorOptions('active')

  const loadClasses = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setListError(null)
    try {
      const response = await listClasses(query)
      if (requestId === requestIdRef.current) {
        setItems(response.items)
        setTotal(response.total)
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setItems([])
        setTotal(0)
        setListError(getApiErrorMessage(error, '班级列表加载失败'))
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [query])

  useEffect(() => {
    void loadClasses()
  }, [loadClasses])

  const handleSearch = (values: ClassSearchValues) => {
    setQuery((current) => ({
      page: 1,
      page_size: current.page_size,
      keyword: values.keyword?.trim() || undefined,
      major_id: values.major_id,
      enrollment_year: values.enrollment_year,
      status: values.status,
    }))
  }

  const handleReset = () => {
    searchForm.resetFields()
    setQuery((current) => ({ page: 1, page_size: current.page_size }))
  }

  const handleRefresh = () => {
    void loadClasses()
    allMajorOptions.reload()
    activeMajorOptions.reload()
  }

  const handleSaved = (_classInfo: ClassInfo, mode: 'create' | 'edit') => {
    setModalOpen(false)
    setEditingClass(null)
    void message.success(mode === 'create' ? '班级新增成功' : '班级保存成功')
    if (query.page === 1) {
      void loadClasses()
    } else {
      setQuery((current) => ({ ...current, page: 1 }))
    }
  }

  const handleStatusUpdate = async (classInfo: ClassInfo) => {
    const nextStatus: RecordStatus = classInfo.status === 'active' ? 'disabled' : 'active'
    setStatusUpdatingId(classInfo.id)
    try {
      await updateClassStatus(classInfo.id, nextStatus)
      void message.success(nextStatus === 'active' ? '班级已启用' : '班级已禁用')
      await loadClasses()
    } catch (error) {
      void message.error(getApiErrorMessage(error, '班级状态更新失败'))
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const columns: TableColumnsType<ClassInfo> = [
    { title: '班级名称', dataIndex: 'name', width: 170 },
    { title: '班级编码', dataIndex: 'code', width: 150 },
    {
      title: '所属专业',
      dataIndex: 'major',
      width: 190,
      render: (major: ClassInfo['major']) => (
        <span>
          {major.name} <Typography.Text type="secondary">/ {major.code}</Typography.Text>
        </span>
      ),
    },
    {
      title: '入学年份',
      dataIndex: 'enrollment_year',
      width: 100,
      render: (year: number | null) => year ?? '—',
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (status: RecordStatus) => <StatusTag status={status} />,
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      render: (description: string | null) => description || '—',
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      width: 170,
      render: (value: string) => formatDateTime(value),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 150,
      render: (_, classInfo) => {
        const actionLabel = classInfo.status === 'active' ? '禁用' : '启用'
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              aria-label={`编辑班级 ${classInfo.name}`}
              data-e2e={`edit-class-${classInfo.id}`}
              onClick={() => {
                setEditingClass(classInfo)
                setModalOpen(true)
              }}
            >
              编辑
            </Button>
            <Popconfirm
              title={`确认${actionLabel}“${classInfo.name}”班级吗？`}
              okText="确认"
              cancelText="取消"
              onConfirm={() => handleStatusUpdate(classInfo)}
            >
              <Button
                type="link"
                size="small"
                danger={classInfo.status === 'active'}
                loading={statusUpdatingId === classInfo.id}
                aria-label={`${actionLabel}班级 ${classInfo.name}`}
                data-e2e={`status-class-${classInfo.id}`}
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
          <Typography.Title level={3}>班级管理</Typography.Title>
          <Typography.Text type="secondary">维护班级信息及其专业归属</Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          data-e2e="create-class"
          onClick={() => {
            setEditingClass(null)
            setModalOpen(true)
          }}
        >
          新增班级
        </Button>
      </div>

      <Card className="filter-card" size="small">
        <Form<ClassSearchValues>
          form={searchForm}
          className="filter-form class-filter-form"
          layout="inline"
          onFinish={handleSearch}
        >
          <Form.Item label="关键词" name="keyword">
            <Input
              allowClear
              placeholder="班级名称或编码"
              maxLength={100}
              data-e2e="class-keyword"
            />
          </Form.Item>
          <Form.Item label="专业" name="major_id">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="全部专业"
              loading={allMajorOptions.isLoading}
              options={allMajorOptions.majors.map((major) => ({
                value: major.id,
                label: `${major.name} / ${major.code}`,
              }))}
              data-e2e="class-major-filter"
            />
          </Form.Item>
          <Form.Item label="入学年份" name="enrollment_year">
            <InputNumber min={1900} max={2100} precision={0} placeholder="全部年份" />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select
              allowClear
              placeholder="全部状态"
              options={[
                { value: 'active', label: '启用' },
                { value: 'disabled', label: '禁用' },
              ]}
            />
          </Form.Item>
          <Form.Item className="filter-actions">
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                查询
              </Button>
              <Button onClick={handleReset}>重置</Button>
              <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
                刷新
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {allMajorOptions.error !== null && (
        <Alert
          className="list-error-alert"
          type="warning"
          showIcon
          message="专业筛选选项加载失败，班级列表仍可使用"
        />
      )}
      {listError !== null && (
        <Alert
          className="list-error-alert"
          type="error"
          showIcon
          message={listError}
          action={
            <Button size="small" onClick={() => void loadClasses()}>
              重试
            </Button>
          }
        />
      )}

      <Card className="table-card" variant="borderless">
        <Table<ClassInfo>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={isLoading}
          scroll={{ x: 1220 }}
          locale={{ emptyText: '暂无班级数据' }}
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

      <ClassFormModal
        open={modalOpen}
        classInfo={editingClass}
        activeMajors={activeMajorOptions.majors}
        majorsLoading={activeMajorOptions.isLoading}
        majorsError={activeMajorOptions.error}
        onCancel={() => {
          setModalOpen(false)
          setEditingClass(null)
        }}
        onSaved={handleSaved}
      />
    </div>
  )
}
