import {
  Alert,
  Button,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Space,
  Spin,
} from 'antd'
import type { Dayjs } from 'dayjs'
import { useEffect, useMemo, useRef, useState } from 'react'

import { getClass, listAllClasses } from '../../api/classes'
import { createExam, updateExam } from '../../api/exams'
import { getApiErrorMessage } from '../../api/errors'
import { listAllMajors } from '../../api/majors'
import { listAllPapers } from '../../api/papers'
import type { ClassInfo } from '../../types/class'
import type {
  ExamDetail,
  ExamTargetRequest,
  ExamTargetType,
} from '../../types/exam'
import type { Major } from '../../types/major'
import type { PaperListItem } from '../../types/paper'
import {
  fromUtcNaiveDateTime,
  toUtcNaiveDateTime,
} from '../../utils/examDateTime'

interface ExamFormValues {
  name: string
  paper_id: number
  description?: string
  start_time: Dayjs
  end_time: Dayjs
  duration_minutes: number
  pass_score: number
  target_type: ExamTargetType
  target_major_id?: number
  target_id?: number
}

interface ExamFormDrawerProps {
  open: boolean
  exam: ExamDetail | null
  onCancel: () => void
  onSaved: (exam: ExamDetail, mode: 'create' | 'edit') => void
}

export function ExamFormDrawer({
  open,
  exam,
  onCancel,
  onSaved,
}: ExamFormDrawerProps) {
  const [form] = Form.useForm<ExamFormValues>()
  const [papers, setPapers] = useState<PaperListItem[]>([])
  const [majors, setMajors] = useState<Major[]>([])
  const [classes, setClasses] = useState<ClassInfo[]>([])
  const [isPaperLoading, setIsPaperLoading] = useState(false)
  const [isMajorLoading, setIsMajorLoading] = useState(false)
  const [isClassLoading, setIsClassLoading] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [initialFormValues, setInitialFormValues] = useState<
    Partial<ExamFormValues>
  >({
    duration_minutes: 90,
    pass_score: 0,
    target_type: 'all',
  })
  const initializationRef = useRef(0)
  const selectedPaperId = Form.useWatch('paper_id', form)
  const targetType = Form.useWatch('target_type', form)
  const targetMajorId = Form.useWatch('target_major_id', form)
  const selectedPaper = useMemo(
    () => papers.find((paper) => paper.id === selectedPaperId),
    [papers, selectedPaperId],
  )

  const loadMajors = async () => {
    setIsMajorLoading(true)
    try {
      const items = await listAllMajors('active')
      setMajors(items)
      return items
    } finally {
      setIsMajorLoading(false)
    }
  }

  const loadClasses = async (majorId: number) => {
    setIsClassLoading(true)
    try {
      const items = await listAllClasses({ major_id: majorId, status: 'active' })
      setClasses(items)
      return items
    } finally {
      setIsClassLoading(false)
    }
  }

  useEffect(() => {
    if (!open) {
      return
    }

    const initializationId = ++initializationRef.current
    setFormError(null)
    setPapers([])
    setMajors([])
    setClasses([])
    setIsInitializing(true)
    setIsPaperLoading(true)

    const initialize = async () => {
      try {
        const activePapers = await listAllPapers({ status: 'active' })
        if (initializationId !== initializationRef.current) {
          return
        }
        setPapers(activePapers)

        if (exam === null) {
          setInitialFormValues({
            name: '',
            description: undefined,
            duration_minutes: 90,
            pass_score: 0,
            target_type: 'all',
            target_id: undefined,
            target_major_id: undefined,
          })
          return
        }

        let targetMajorId: number | undefined
        if (exam.target?.type === 'major') {
          await loadMajors()
          targetMajorId = exam.target.id ?? undefined
        } else if (exam.target?.type === 'class' && exam.target.id !== null) {
          await loadMajors()
          const currentClass = await getClass(exam.target.id)
          targetMajorId = currentClass.major_id
          await loadClasses(currentClass.major_id)
        }

        if (initializationId !== initializationRef.current) {
          return
        }
        setInitialFormValues({
          name: exam.name,
          paper_id: exam.paper.id,
          description: exam.description ?? undefined,
          start_time: fromUtcNaiveDateTime(exam.start_time),
          end_time: fromUtcNaiveDateTime(exam.end_time),
          duration_minutes: exam.duration_minutes,
          pass_score: Number(exam.pass_score),
          target_type: exam.target?.type ?? 'all',
          target_major_id: targetMajorId,
          target_id: exam.target?.id ?? undefined,
        })
      } catch (error) {
        if (initializationId === initializationRef.current) {
          setFormError(getApiErrorMessage(error, '考试表单数据加载失败'))
        }
      } finally {
        if (initializationId === initializationRef.current) {
          setIsPaperLoading(false)
          setIsInitializing(false)
        }
      }
    }

    void initialize()
    return () => {
      initializationRef.current += 1
    }
  }, [exam, form, open])

  const handleTargetTypeChange = async (nextType: ExamTargetType) => {
    form.setFieldsValue({ target_id: undefined, target_major_id: undefined })
    setClasses([])
    if (nextType !== 'all' && majors.length === 0) {
      try {
        await loadMajors()
      } catch (error) {
        setFormError(getApiErrorMessage(error, '专业数据加载失败'))
      }
    }
  }

  const buildTarget = (values: ExamFormValues): ExamTargetRequest => {
    if (values.target_type === 'all') {
      return { target_type: 'all', target_id: null }
    }
    return {
      target_type: values.target_type,
      target_id: values.target_id ?? null,
    }
  }

  const handleSubmit = async (values: ExamFormValues) => {
    if (isSubmitting) {
      return
    }
    setIsSubmitting(true)
    setFormError(null)
    try {
      const payload = {
        name: values.name.trim(),
        paper_id: values.paper_id,
        description: values.description?.trim() || null,
        start_time: toUtcNaiveDateTime(values.start_time),
        end_time: toUtcNaiveDateTime(values.end_time),
        duration_minutes: values.duration_minutes,
        pass_score: values.pass_score.toFixed(2),
        target: buildTarget(values),
      }
      const saved =
        exam === null
          ? await createExam(payload)
          : await updateExam(exam.id, payload)
      form.resetFields()
      onSaved(saved, exam === null ? 'create' : 'edit')
    } catch (error) {
      setFormError(
        getApiErrorMessage(error, exam === null ? '考试创建失败' : '考试保存失败'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Drawer
      open={open}
      title={exam === null ? '新增考试草稿' : '编辑考试草稿'}
      width="min(900px, 96vw)"
      destroyOnHidden
      maskClosable={!isSubmitting}
      closable={!isSubmitting}
      onClose={onCancel}
      extra={
        <Space>
          <Button disabled={isSubmitting} onClick={onCancel}>
            取消
          </Button>
          <Button
            type="primary"
            loading={isSubmitting}
            disabled={isInitializing}
            data-e2e="save-exam"
            onClick={() => form.submit()}
          >
            {isSubmitting ? '保存中…' : '保存草稿'}
          </Button>
        </Space>
      }
    >
      {formError !== null && (
        <Alert className="form-error-alert" type="error" showIcon message={formError} />
      )}
      {isInitializing ? (
        <div className="exam-form-loading">
          <Spin />
        </div>
      ) : (
        <Form<ExamFormValues>
          form={form}
          name="exam-editor"
          layout="vertical"
          preserve={false}
          initialValues={initialFormValues}
          onFinish={handleSubmit}
        >
          <div className="exam-form-grid">
            <Form.Item
              label="考试名称"
              name="name"
              rules={[{ required: true, whitespace: true, message: '请输入考试名称' }]}
            >
              <Input
                maxLength={200}
                placeholder="例如：2026 云计算 Linux 阶段考试"
                data-e2e="exam-name"
              />
            </Form.Item>
            <Form.Item
              label="试卷"
              name="paper_id"
              rules={[{ required: true, message: '请选择已启用试卷' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={isPaperLoading}
                placeholder="请选择 active 试卷"
                data-e2e="exam-paper"
                options={papers.map((paper) => ({
                  value: paper.id,
                  label: `${paper.name}（${paper.total_score} 分 / ${paper.question_count} 题）`,
                }))}
              />
            </Form.Item>
          </div>

          {selectedPaper !== undefined && (
            <Descriptions className="exam-paper-summary" size="small" column={3}>
              <Descriptions.Item label="已选试卷">{selectedPaper.name}</Descriptions.Item>
              <Descriptions.Item label="题目数">
                {selectedPaper.question_count} 题
              </Descriptions.Item>
              <Descriptions.Item label="当前总分">
                {selectedPaper.total_score} 分
              </Descriptions.Item>
            </Descriptions>
          )}

          <Form.Item label="考试说明" name="description">
            <Input.TextArea
              rows={3}
              showCount
              placeholder="填写考试说明（可选）"
            />
          </Form.Item>

          <div className="exam-form-grid">
            <Form.Item
              label="开始时间"
              name="start_time"
              dependencies={['end_time']}
              rules={[
                { required: true, message: '请选择开始时间' },
                ({ getFieldValue }) => ({
                  validator(_, value: Dayjs | undefined) {
                    const end = getFieldValue('end_time') as Dayjs | undefined
                    if (value === undefined || end === undefined || value.isBefore(end)) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('开始时间必须早于结束时间'))
                  },
                }),
              ]}
            >
              <DatePicker
                showTime
                format="YYYY-MM-DD HH:mm:ss"
                placeholder="选择开始时间"
                data-e2e="exam-start-time"
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item
              label="结束时间"
              name="end_time"
              dependencies={['start_time']}
              rules={[
                { required: true, message: '请选择结束时间' },
                ({ getFieldValue }) => ({
                  validator(_, value: Dayjs | undefined) {
                    const start = getFieldValue('start_time') as Dayjs | undefined
                    if (value === undefined || start === undefined || start.isBefore(value)) {
                      return Promise.resolve()
                    }
                    return Promise.reject(new Error('结束时间必须晚于开始时间'))
                  },
                }),
              ]}
            >
              <DatePicker
                showTime
                format="YYYY-MM-DD HH:mm:ss"
                placeholder="选择结束时间"
                data-e2e="exam-end-time"
                style={{ width: '100%' }}
              />
            </Form.Item>
            <Form.Item
              label="考试时长（分钟）"
              name="duration_minutes"
              rules={[
                { required: true, message: '请输入考试时长' },
                { type: 'number', min: 1, message: '考试时长必须大于 0 分钟' },
              ]}
              extra="学生截止时间不会晚于统一考试结束时间"
            >
              <InputNumber
                min={1}
                max={1440}
                precision={0}
                style={{ width: '100%' }}
                data-e2e="exam-duration"
              />
            </Form.Item>
            <Form.Item
              label="及格分"
              name="pass_score"
              dependencies={['paper_id']}
              rules={[
                { required: true, message: '请输入及格分' },
                {
                  validator(_, value: number | undefined) {
                    if (value === undefined || value < 0) {
                      return Promise.reject(new Error('及格分不能小于 0'))
                    }
                    if (
                      selectedPaper !== undefined &&
                      value > Number(selectedPaper.total_score)
                    ) {
                      return Promise.reject(new Error('及格分不能超过所选试卷总分'))
                    }
                    return Promise.resolve()
                  },
                },
              ]}
            >
              <InputNumber
                min={0}
                precision={2}
                step={0.5}
                style={{ width: '100%' }}
                data-e2e="exam-pass-score"
              />
            </Form.Item>
          </div>

          <Form.Item
            label="考试对象"
            name="target_type"
            rules={[{ required: true }]}
          >
            <Radio.Group
              data-e2e="exam-target-type"
              onChange={(event) =>
                void handleTargetTypeChange(event.target.value as ExamTargetType)
              }
            >
              <Radio.Button value="all">全部学生</Radio.Button>
              <Radio.Button value="major">指定专业</Radio.Button>
              <Radio.Button value="class">指定班级</Radio.Button>
            </Radio.Group>
          </Form.Item>

          {targetType === 'major' && (
            <Form.Item
              label="专业"
              name="target_id"
              rules={[{ required: true, message: '请选择考试专业' }]}
            >
              <Select
                showSearch
                optionFilterProp="label"
                loading={isMajorLoading}
                placeholder="请选择 active 专业"
                data-e2e="exam-target-major"
                options={majors.map((major) => ({
                  value: major.id,
                  label: `${major.name} / ${major.code}`,
                }))}
              />
            </Form.Item>
          )}

          {targetType === 'class' && (
            <div className="exam-form-grid">
              <Form.Item
                label="专业（用于筛选班级）"
                name="target_major_id"
                rules={[{ required: true, message: '请先选择专业' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  loading={isMajorLoading}
                  placeholder="请选择 active 专业"
                  data-e2e="exam-target-class-major"
                  options={majors.map((major) => ({
                    value: major.id,
                    label: `${major.name} / ${major.code}`,
                  }))}
                  onChange={(majorId: number) => {
                    form.setFieldValue('target_id', undefined)
                    setClasses([])
                    void loadClasses(majorId).catch((error: unknown) => {
                      setFormError(getApiErrorMessage(error, '班级数据加载失败'))
                    })
                  }}
                />
              </Form.Item>
              <Form.Item
                label="班级"
                name="target_id"
                rules={[{ required: true, message: '请选择考试班级' }]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  loading={isClassLoading}
                  disabled={targetMajorId === undefined}
                  placeholder="请选择该专业下的 active 班级"
                  data-e2e="exam-target-class"
                  options={classes.map((classInfo) => ({
                    value: classInfo.id,
                    label: `${classInfo.name} / ${classInfo.code}`,
                  }))}
                />
              </Form.Item>
            </div>
          )}
        </Form>
      )}
    </Drawer>
  )
}
