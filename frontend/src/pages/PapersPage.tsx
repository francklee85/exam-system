import { PlusOutlined, ReloadOutlined, SearchOutlined } from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Card,
  Form,
  Input,
  Select,
  Space,
  Table,
  Typography,
} from 'antd'
import type { TableColumnsType } from 'antd'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { getApiErrorMessage } from '../api/errors'
import { listPapers } from '../api/papers'
import { PaperFormModal } from '../components/papers/PaperFormModal'
import { PaperStatusTag } from '../components/papers/PaperStatusTag'
import type {
  PaperDetail,
  PaperListItem,
  PaperListParams,
  PaperStatus,
} from '../types/paper'
import { formatDateTime } from '../utils/dateTime'

interface PaperSearchValues {
  keyword?: string
  status?: PaperStatus
}

const DEFAULT_PAGE_SIZE = 10

export function PapersPage() {
  const { message } = App.useApp()
  const navigate = useNavigate()
  const [searchForm] = Form.useForm<PaperSearchValues>()
  const [items, setItems] = useState<PaperListItem[]>([])
  const [total, setTotal] = useState(0)
  const [query, setQuery] = useState<PaperListParams>({
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const requestIdRef = useRef(0)

  const loadPapers = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setIsLoading(true)
    setListError(null)
    try {
      const response = await listPapers(query)
      if (requestId === requestIdRef.current) {
        setItems(response.items)
        setTotal(response.total)
      }
    } catch (error) {
      if (requestId === requestIdRef.current) {
        setItems([])
        setTotal(0)
        setListError(getApiErrorMessage(error, '试卷列表加载失败'))
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false)
      }
    }
  }, [query])

  useEffect(() => {
    void loadPapers()
  }, [loadPapers])

  const columns: TableColumnsType<PaperListItem> = [
    {
      title: '试卷名称',
      dataIndex: 'name',
      width: 260,
      render: (name: string, paper) => (
        <Button
          type="link"
          className="paper-name-link"
          data-e2e={`view-paper-${paper.id}`}
          onClick={() => navigate(`/papers/${paper.id}`)}
        >
          {name}
        </Button>
      ),
    },
    { title: '题目数量', dataIndex: 'question_count', width: 100 },
    {
      title: '总分',
      dataIndex: 'total_score',
      width: 100,
      render: (score: string) => <Typography.Text strong>{score}</Typography.Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      render: (status: PaperStatus) => <PaperStatusTag status={status} />,
    },
    {
      title: '创建人',
      dataIndex: 'creator',
      width: 150,
      render: (creator: PaperListItem['creator']) => (
        <div className="question-creator">
          <Typography.Text>{creator.real_name}</Typography.Text>
          <Typography.Text type="secondary">{creator.username}</Typography.Text>
        </div>
      ),
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
      width: 100,
      fixed: 'right',
      render: (_, paper) => (
        <Button
          type="link"
          size="small"
          aria-label={`查看试卷 ${paper.id}`}
          onClick={() => navigate(`/papers/${paper.id}`)}
        >
          查看 / 组卷
        </Button>
      ),
    },
  ]

  return (
    <div className="management-page">
      <div className="management-page-header">
        <div>
          <Typography.Title level={3}>试卷管理</Typography.Title>
          <Typography.Text type="secondary">
            创建试卷并从题库人工选题，试卷总分由后端自动计算
          </Typography.Text>
        </div>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          data-e2e="create-paper"
          onClick={() => setFormOpen(true)}
        >
          新增试卷
        </Button>
      </div>

      <Card className="filter-card" size="small">
        <Form<PaperSearchValues>
          form={searchForm}
          layout="inline"
          className="filter-form"
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
              maxLength={200}
              placeholder="搜索试卷名称"
              data-e2e="paper-keyword"
            />
          </Form.Item>
          <Form.Item label="状态" name="status">
            <Select
              allowClear
              placeholder="全部状态"
              data-e2e="paper-status-filter"
              options={[
                { value: 'draft', label: '草稿' },
                { value: 'active', label: '已启用' },
                { value: 'disabled', label: '已禁用' },
              ]}
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
              <Button icon={<ReloadOutlined />} onClick={() => void loadPapers()}>
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
            <Button size="small" onClick={() => void loadPapers()}>
              重试
            </Button>
          }
        />
      )}

      <Card className="table-card" variant="borderless">
        <Table<PaperListItem>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={isLoading}
          scroll={{ x: 1150 }}
          locale={{ emptyText: '暂无试卷数据' }}
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

      <PaperFormModal
        open={formOpen}
        paper={null}
        onCancel={() => setFormOpen(false)}
        onSaved={(paper: PaperDetail) => {
          setFormOpen(false)
          void message.success('试卷创建成功，开始组卷')
          navigate(`/papers/${paper.id}`)
        }}
      />
    </div>
  )
}
