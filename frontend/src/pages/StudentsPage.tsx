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
import { listStudents, updateStudentStatus } from '../api/students'
import { StatusTag } from '../components/StatusTag'
import { StudentFormModal } from '../components/students/StudentFormModal'
import { useClassOptions } from '../hooks/useClassOptions'
import { useMajorOptions } from '../hooks/useMajorOptions'
import type { RecordStatus } from '../types/common'
import type { Student, StudentListParams } from '../types/student'
import { formatDateTime } from '../utils/dateTime'

interface StudentSearchValues {
  keyword?: string
  student_no?: string
  major_id?: number
  class_id?: number
  status?: RecordStatus
}

const DEFAULT_PAGE_SIZE = 10

export function StudentsPage() {
  const { message } = App.useApp()
  const [searchForm] = Form.useForm<StudentSearchValues>()
  const [filterMajorId, setFilterMajorId] = useState<number>()
  const [items, setItems] = useState<Student[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [query, setQuery] = useState<StudentListParams>({
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
  })
  const [modalOpen, setModalOpen] = useState(false)
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null)
  const requestIdRef = useRef(0)
  const allMajorOptions = useMajorOptions()
  const activeMajorOptions = useMajorOptions('active')
  const filterClassOptions = useClassOptions({ majorId: filterMajorId })

  const loadStudents = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setListError(null)
    try {
      const response = await listStudents(query)
      if (requestId === requestIdRef.current) {
        setItems(response.items)
        setTotal(response.total)
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setItems([])
        setTotal(0)
        setListError(getApiErrorMessage(error, '学生列表加载失败'))
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [query])

  useEffect(() => {
    void loadStudents()
  }, [loadStudents])

  const handleSaved = (_student: Student, mode: 'create' | 'edit') => {
    setModalOpen(false)
    setEditingStudent(null)
    void message.success(mode === 'create' ? '学生新增成功' : '学生保存成功')
    if (query.page === 1) {
      void loadStudents()
    } else {
      setQuery((current) => ({ ...current, page: 1 }))
    }
  }

  const handleStatusUpdate = async (student: Student) => {
    const nextStatus: RecordStatus = student.status === 'active' ? 'disabled' : 'active'
    setStatusUpdatingId(student.id)
    try {
      await updateStudentStatus(student.id, nextStatus)
      void message.success(nextStatus === 'active' ? '学生已启用' : '学生已禁用')
      await loadStudents()
    } catch (error) {
      void message.error(getApiErrorMessage(error, '学生状态更新失败'))
    } finally {
      setStatusUpdatingId(null)
    }
  }

  const columns: TableColumnsType<Student> = [
    { title: '学号', dataIndex: 'student_no', width: 150 },
    { title: '用户名', dataIndex: 'username', width: 150 },
    { title: '姓名', dataIndex: 'real_name', width: 130 },
    {
      title: '专业',
      dataIndex: 'major',
      width: 160,
      render: (major: Student['major']) => major.name,
    },
    {
      title: '班级',
      dataIndex: 'class',
      width: 180,
      render: (studentClass: Student['class']) => studentClass.name,
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
      title: '操作',
      key: 'actions',
      fixed: 'right',
      width: 150,
      render: (_, student) => {
        const actionLabel = student.status === 'active' ? '禁用' : '启用'
        return (
          <Space size="small">
            <Button
              type="link"
              size="small"
              aria-label={`编辑学生 ${student.real_name}`}
              data-e2e={`edit-student-${student.id}`}
              onClick={() => {
                setEditingStudent(student)
                setModalOpen(true)
              }}
            >
              编辑
            </Button>
            <Popconfirm
              title={`确认${actionLabel}“${student.real_name}”学生吗？`}
              okText="确认"
              cancelText="取消"
              onConfirm={() => handleStatusUpdate(student)}
            >
              <Button
                type="link"
                size="small"
                danger={student.status === 'active'}
                loading={statusUpdatingId === student.id}
                aria-label={`${actionLabel}学生 ${student.real_name}`}
                data-e2e={`status-student-${student.id}`}
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
          <Typography.Title level={3}>学生管理</Typography.Title>
          <Typography.Text type="secondary">维护学生账号、学号及班级归属</Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          data-e2e="create-student"
          onClick={() => {
            setEditingStudent(null)
            setModalOpen(true)
          }}
        >
          新增学生
        </Button>
      </div>

      <Card className="filter-card" size="small">
        <Form<StudentSearchValues>
          form={searchForm}
          name="student-search"
          className="filter-form student-filter-form"
          layout="inline"
          onFinish={(values) => {
            setQuery((current) => ({
              page: 1,
              page_size: current.page_size,
              keyword: values.keyword?.trim() || undefined,
              student_no: values.student_no?.trim() || undefined,
              major_id: values.major_id,
              class_id: values.class_id,
              status: values.status,
            }))
          }}
          onValuesChange={(changedValues) => {
            if ('major_id' in changedValues) {
              const majorId = changedValues.major_id as number | undefined
              setFilterMajorId(majorId)
              searchForm.setFieldValue('class_id', undefined)
            }
          }}
        >
          <Form.Item label="关键词" name="keyword">
            <Input
              allowClear
              placeholder="用户名、姓名或学号"
              maxLength={100}
              data-e2e="student-keyword"
            />
          </Form.Item>
          <Form.Item label="学号" name="student_no">
            <Input
              allowClear
              placeholder="精确学号"
              maxLength={50}
              data-e2e="student-no-filter"
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
              data-e2e="student-major-filter"
            />
          </Form.Item>
          <Form.Item label="班级" name="class_id">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="全部班级"
              loading={filterClassOptions.isLoading}
              options={filterClassOptions.classes.map((classInfo) => ({
                value: classInfo.id,
                label: `${classInfo.name} / ${classInfo.code}`,
              }))}
              data-e2e="student-class-filter"
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
              data-e2e="student-status-filter"
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
                  setFilterMajorId(undefined)
                  setQuery((current) => ({ page: 1, page_size: current.page_size }))
                }}
              >
                重置
              </Button>
              <Button
                icon={<ReloadOutlined />}
                onClick={() => {
                  void loadStudents()
                  allMajorOptions.reload()
                  activeMajorOptions.reload()
                  filterClassOptions.reload()
                }}
              >
                刷新
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {(allMajorOptions.error !== null || filterClassOptions.error !== null) && (
        <Alert
          className="list-error-alert"
          type="warning"
          showIcon
          message="专业或班级筛选选项加载失败，学生列表仍可使用"
        />
      )}
      {listError !== null && (
        <Alert
          className="list-error-alert"
          type="error"
          showIcon
          message={listError}
          action={
            <Button size="small" onClick={() => void loadStudents()}>
              重试
            </Button>
          }
        />
      )}

      <Card className="table-card" variant="borderless">
        <Table<Student>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={isLoading}
          scroll={{ x: 1200 }}
          locale={{ emptyText: '暂无学生数据' }}
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

      <StudentFormModal
        open={modalOpen}
        student={editingStudent}
        activeMajors={activeMajorOptions.majors}
        majorsLoading={activeMajorOptions.isLoading}
        majorsError={activeMajorOptions.error}
        onCancel={() => {
          setModalOpen(false)
          setEditingStudent(null)
        }}
        onSaved={handleSaved}
      />
    </div>
  )
}
