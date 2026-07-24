import {
  CheckCircleOutlined,
  FileMarkdownOutlined,
  InboxOutlined,
} from '@ant-design/icons'
import {
  Alert,
  App,
  Button,
  Collapse,
  Drawer,
  Input,
  Result,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  Upload,
} from 'antd'
import type { TableColumnsType, UploadProps } from 'antd'
import { useEffect, useState } from 'react'

import { getApiErrorMessage } from '../../api/errors'
import {
  importQuestionMarkdown,
  previewQuestionMarkdown,
} from '../../api/questions'
import type {
  MarkdownImportError,
  MarkdownImportPreview,
  MarkdownImportPreviewItem,
  MarkdownImportResult,
} from '../../types/question'
import {
  DIFFICULTY_LABELS,
  QUESTION_TYPE_COLORS,
  QUESTION_TYPE_LABELS,
} from '../../utils/questionPresentation'
import {
  QUESTION_MARKDOWN_AI_PROMPT,
  QUESTION_MARKDOWN_EXAMPLE,
  QUESTION_MARKDOWN_RULES,
} from '../../utils/questionMarkdownImport'

const MAX_MARKDOWN_FILE_SIZE = 1_000_000

interface QuestionMarkdownImportDrawerProps {
  open: boolean
  onClose: () => void
  onImported: () => void
}

function formatImportError(error: MarkdownImportError): string {
  const position = error.line === null ? '' : `第 ${error.line} 行`
  const field = error.field === null ? '' : `（${error.field}）`
  return `${position}${field}${position || field ? '：' : ''}${error.message}`
}

export function QuestionMarkdownImportDrawer({
  open,
  onClose,
  onImported,
}: QuestionMarkdownImportDrawerProps) {
  const { message } = App.useApp()
  const [markdown, setMarkdown] = useState('')
  const [preview, setPreview] = useState<MarkdownImportPreview | null>(null)
  const [result, setResult] = useState<MarkdownImportResult | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    setMarkdown('')
    setPreview(null)
    setResult(null)
    setError(null)
    setIsPreviewing(false)
    setIsImporting(false)
  }, [open])

  const handleFile: UploadProps['beforeUpload'] = async (file) => {
    if (!file.name.toLowerCase().endsWith('.md')) {
      void message.error('只支持上传 .md 文件')
      return Upload.LIST_IGNORE
    }
    if (file.size > MAX_MARKDOWN_FILE_SIZE) {
      void message.error('Markdown 文件不能超过 1 MB')
      return Upload.LIST_IGNORE
    }
    try {
      const text = await file.text()
      setMarkdown(text)
      setPreview(null)
      setResult(null)
      setError(null)
      void message.success(`已读取 ${file.name}`)
    } catch {
      void message.error('Markdown 文件读取失败')
    }
    return Upload.LIST_IGNORE
  }

  const handlePreview = async () => {
    if (!markdown.trim()) {
      setError('请粘贴 Markdown 内容或上传 .md 文件')
      return
    }
    setIsPreviewing(true)
    setError(null)
    setResult(null)
    try {
      setPreview(await previewQuestionMarkdown(markdown))
    } catch (previewError) {
      setPreview(null)
      setError(getApiErrorMessage(previewError, 'Markdown 解析失败'))
    } finally {
      setIsPreviewing(false)
    }
  }

  const handleImport = async () => {
    if (preview === null || preview.valid_count === 0 || isImporting) {
      return
    }
    setIsImporting(true)
    setError(null)
    try {
      const imported = await importQuestionMarkdown(markdown)
      setResult(imported)
      onImported()
      void message.success(`成功导入 ${imported.imported_count} 道题`)
    } catch (importError) {
      setError(getApiErrorMessage(importError, 'Markdown 题目导入失败'))
    } finally {
      setIsImporting(false)
    }
  }

  const columns: TableColumnsType<MarkdownImportPreviewItem> = [
    {
      title: '序号',
      dataIndex: 'number',
      width: 72,
      render: (number: number) => `第 ${number} 题`,
    },
    {
      title: '位置',
      width: 105,
      render: (_, item) => `${item.start_line}-${item.end_line} 行`,
    },
    {
      title: '结果',
      dataIndex: 'valid',
      width: 84,
      render: (valid: boolean) => (
        <Tag color={valid ? 'success' : 'error'}>{valid ? '合法' : '有错误'}</Tag>
      ),
    },
    {
      title: '题型 / 难度',
      width: 160,
      render: (_, item) => (
        <Space wrap>
          {item.question_type === null ? (
            <Typography.Text type="secondary">题型未知</Typography.Text>
          ) : (
            <Tag color={QUESTION_TYPE_COLORS[item.question_type]}>
              {QUESTION_TYPE_LABELS[item.question_type]}
            </Tag>
          )}
          {item.difficulty !== null && (
            <Tag>{DIFFICULTY_LABELS[item.difficulty]}</Tag>
          )}
        </Space>
      ),
    },
    {
      title: '题干预览',
      dataIndex: 'content',
      render: (content: string | null) => (
        <Typography.Paragraph
          className="markdown-import-content"
          ellipsis={content === null ? false : { rows: 4, expandable: true }}
        >
          {content ?? '未能解析题干'}
        </Typography.Paragraph>
      ),
    },
    {
      title: '错误原因',
      dataIndex: 'errors',
      width: 310,
      render: (errors: MarkdownImportError[]) =>
        errors.length === 0 ? (
          <Typography.Text type="success">可导入</Typography.Text>
        ) : (
          <ul className="markdown-import-error-list">
            {errors.map((item, index) => (
              <li key={`${item.line ?? 'document'}-${index}`}>
                {formatImportError(item)}
              </li>
            ))}
          </ul>
        ),
    },
  ]

  return (
    <Drawer
      open={open}
      title={
        <Space>
          <FileMarkdownOutlined />
          Markdown 批量导入题目
        </Space>
      }
      width={960}
      rootClassName="question-markdown-import-drawer"
      destroyOnHidden
      maskClosable={!isImporting}
      closable={!isImporting}
      onClose={onClose}
      footer={
        <div className="question-drawer-footer">
          <Space>
            <Button disabled={isImporting} onClick={onClose}>
              关闭
            </Button>
            {result === null && (
              <>
                <Button
                  loading={isPreviewing}
                  disabled={isImporting || !markdown.trim()}
                  onClick={() => void handlePreview()}
                  data-e2e="preview-question-markdown"
                >
                  解析预览
                </Button>
                <Button
                  type="primary"
                  loading={isImporting}
                  disabled={preview === null || preview.valid_count === 0}
                  onClick={() => void handleImport()}
                  data-e2e="confirm-question-markdown-import"
                >
                  确认导入合法题目
                </Button>
              </>
            )}
          </Space>
        </div>
      }
    >
      {error !== null && (
        <Alert
          className="form-error-alert"
          type="error"
          showIcon
          message={error}
        />
      )}

      {result !== null ? (
        <Result
          status="success"
          icon={<CheckCircleOutlined />}
          title={`成功导入 ${result.imported_count} 道题`}
          subTitle={`共解析 ${result.total_count} 道，跳过 ${result.skipped_count} 道非法题目。题目创建人为当前登录用户，初始状态均为启用。`}
          extra={
            <Button
              type="primary"
              onClick={() => {
                setMarkdown('')
                setPreview(null)
                setResult(null)
              }}
            >
              继续导入
            </Button>
          }
        />
      ) : (
        <>
          <Alert
            className="markdown-import-intro"
            type="info"
            showIcon
            message="固定格式导入"
            description="系统只识别约定字段，不会猜测或自动修复错误。请先解析预览，确认后只导入合法题目。"
          />

          <Collapse
            className="markdown-import-guide"
            items={[
              {
                key: 'rules',
                label: '查看 Markdown 格式说明与示例',
                children: (
                  <>
                    <ul>
                      {QUESTION_MARKDOWN_RULES.map((rule) => (
                        <li key={rule}>{rule}</li>
                      ))}
                    </ul>
                    <pre className="markdown-format-example">
                      {QUESTION_MARKDOWN_EXAMPLE}
                    </pre>
                  </>
                ),
              },
              {
                key: 'prompt',
                label: 'AI 出题 Prompt 模板',
                children: (
                  <>
                    <Typography.Paragraph type="secondary">
                      将模板复制给 ChatGPT、Claude、DeepSeek 等工具，并替换课程主题和数量。
                      系统不会自动调用任何 AI API。
                    </Typography.Paragraph>
                    <Typography.Paragraph
                      className="markdown-ai-prompt"
                      copyable={{ text: QUESTION_MARKDOWN_AI_PROMPT }}
                    >
                      {QUESTION_MARKDOWN_AI_PROMPT}
                    </Typography.Paragraph>
                  </>
                ),
              },
            ]}
          />

          <Upload.Dragger
            accept=".md,text/markdown"
            showUploadList={false}
            beforeUpload={handleFile}
            disabled={isPreviewing || isImporting}
            data-e2e="question-markdown-file"
          >
            <p className="ant-upload-drag-icon">
              <InboxOutlined />
            </p>
            <p className="ant-upload-text">点击或拖拽上传 .md 文件</p>
            <p className="ant-upload-hint">最大 1 MB，文件内容会载入下方编辑区</p>
          </Upload.Dragger>

          <Input.TextArea
            className="markdown-import-input"
            rows={15}
            maxLength={1_000_000}
            value={markdown}
            placeholder="在此粘贴标准 Markdown 题库内容"
            onChange={(event) => {
              setMarkdown(event.target.value)
              setPreview(null)
              setResult(null)
              setError(null)
            }}
            data-e2e="question-markdown-input"
          />

          {preview !== null && (
            <div
              className="markdown-import-preview"
              data-e2e="markdown-import-preview"
              data-testid="markdown-import-preview"
            >
              <Space className="markdown-import-statistics" size="large">
                <Statistic title="解析题目" value={preview.total_count} />
                <Statistic
                  title="合法"
                  value={preview.valid_count}
                  valueStyle={{ color: '#389e0d' }}
                />
                <Statistic
                  title="有错误"
                  value={preview.invalid_count}
                  valueStyle={{ color: '#cf1322' }}
                />
              </Space>

              {preview.document_errors.map((item, index) => (
                <Alert
                  key={`${item.line ?? 'document'}-${index}`}
                  className="form-error-alert"
                  type="error"
                  showIcon
                  message={formatImportError(item)}
                />
              ))}

              <Table<MarkdownImportPreviewItem>
                rowKey="number"
                columns={columns}
                dataSource={preview.items}
                pagination={false}
                scroll={{ x: 1050 }}
                locale={{ emptyText: '未解析到题目' }}
              />
            </div>
          )}
        </>
      )}
    </Drawer>
  )
}
