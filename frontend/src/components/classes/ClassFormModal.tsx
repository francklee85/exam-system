import { Alert, Form, Input, InputNumber, Modal, Select } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import { createClass, updateClass } from '../../api/classes'
import { getApiErrorMessage } from '../../api/errors'
import type { ClassInfo, ClassWriteRequest } from '../../types/class'
import type { Major } from '../../types/major'

interface ClassFormValues {
  major_id: number
  name: string
  code: string
  enrollment_year?: number
  description?: string
}

interface ClassFormModalProps {
  open: boolean
  classInfo: ClassInfo | null
  activeMajors: Major[]
  majorsLoading: boolean
  majorsError: unknown
  onCancel: () => void
  onSaved: (classInfo: ClassInfo, mode: 'create' | 'edit') => void
}

export function ClassFormModal({
  open,
  classInfo,
  activeMajors,
  majorsLoading,
  majorsError,
  onCancel,
  onSaved,
}: ClassFormModalProps) {
  const [form] = Form.useForm<ClassFormValues>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const isEditing = classInfo !== null

  useEffect(() => {
    if (!open) {
      return
    }

    setFormError(null)
    if (classInfo === null) {
      form.resetFields()
    } else {
      form.setFieldsValue({
        major_id: classInfo.major_id,
        name: classInfo.name,
        code: classInfo.code,
        enrollment_year: classInfo.enrollment_year ?? undefined,
        description: classInfo.description ?? undefined,
      })
    }
  }, [classInfo, form, open])

  const majorOptions = useMemo(() => {
    const options: Array<{ value: number; label: string; disabled?: boolean }> = activeMajors.map(
      (major) => ({
        value: major.id,
        label: `${major.name} / ${major.code}`,
      }),
    )

    if (classInfo !== null && !activeMajors.some((major) => major.id === classInfo.major_id)) {
      options.unshift({
        value: classInfo.major_id,
        label: `${classInfo.major.name} / ${classInfo.major.code}（已禁用）`,
        disabled: true,
      })
    }
    return options
  }, [activeMajors, classInfo])

  const handleSubmit = async (values: ClassFormValues) => {
    if (isSubmitting) {
      return
    }

    const payload: ClassWriteRequest = {
      major_id: values.major_id,
      name: values.name.trim(),
      code: values.code.trim().toUpperCase(),
      enrollment_year: values.enrollment_year ?? null,
      description: values.description?.trim() || null,
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      const savedClass = isEditing
        ? await updateClass(classInfo.id, payload)
        : await createClass(payload)
      onSaved(savedClass, isEditing ? 'edit' : 'create')
      form.resetFields()
    } catch (error) {
      setFormError(getApiErrorMessage(error, isEditing ? '保存班级失败' : '新增班级失败'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={isEditing ? '编辑班级' : '新增班级'}
      okText={isEditing ? '保存' : '创建'}
      cancelText="取消"
      confirmLoading={isSubmitting}
      okButtonProps={{ disabled: isSubmitting || majorsLoading || majorsError !== null }}
      cancelButtonProps={{ disabled: isSubmitting }}
      maskClosable={!isSubmitting}
      closable={!isSubmitting}
      destroyOnHidden
      onOk={() => form.submit()}
      onCancel={onCancel}
    >
      {formError !== null && (
        <Alert className="form-error-alert" type="error" showIcon message={formError} />
      )}
      {majorsError !== null && (
        <Alert
          className="form-error-alert"
          type="error"
          showIcon
          message="专业选项加载失败，请关闭后重试"
        />
      )}

      <Form<ClassFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={handleSubmit}
      >
        <Form.Item
          label="所属专业"
          name="major_id"
          rules={[{ required: true, message: '请选择所属专业' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="请选择启用中的专业"
            loading={majorsLoading}
            options={majorOptions}
            data-e2e="class-major-select"
          />
        </Form.Item>

        <Form.Item
          label="班级名称"
          name="name"
          rules={[
            { required: true, whitespace: true, message: '请输入班级名称' },
            { max: 100, message: '班级名称不能超过 100 个字符' },
          ]}
        >
          <Input placeholder="例如：云计算2501班" maxLength={100} />
        </Form.Item>

        <Form.Item
          label="班级编码"
          name="code"
          rules={[
            { required: true, whitespace: true, message: '请输入班级编码' },
            { max: 50, message: '班级编码不能超过 50 个字符' },
          ]}
        >
          <Input placeholder="例如：CLOUD-2501" maxLength={50} />
        </Form.Item>

        <Form.Item
          label="入学年份"
          name="enrollment_year"
          rules={[
            { type: 'number', min: 1900, max: 2100, message: '入学年份应在 1900 到 2100 之间' },
          ]}
        >
          <InputNumber
            className="full-width-control"
            aria-label="入学年份"
            min={1900}
            max={2100}
            precision={0}
            placeholder="例如：2025"
          />
        </Form.Item>

        <Form.Item
          label="描述"
          name="description"
          rules={[{ max: 500, message: '描述不能超过 500 个字符' }]}
        >
          <Input.TextArea placeholder="请输入班级描述" maxLength={500} rows={3} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}
