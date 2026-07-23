import { Alert, Form, Input, Modal } from 'antd'
import { useEffect, useState } from 'react'

import { createMajor, updateMajor } from '../../api/majors'
import { getApiErrorMessage } from '../../api/errors'
import type { Major, MajorWriteRequest } from '../../types/major'

interface MajorFormValues {
  name: string
  code: string
  description?: string
}

interface MajorFormModalProps {
  open: boolean
  major: Major | null
  onCancel: () => void
  onSaved: (major: Major, mode: 'create' | 'edit') => void
}

export function MajorFormModal({ open, major, onCancel, onSaved }: MajorFormModalProps) {
  const [form] = Form.useForm<MajorFormValues>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const isEditing = major !== null

  useEffect(() => {
    if (!open) {
      return
    }

    setFormError(null)
    if (major === null) {
      form.resetFields()
    } else {
      form.setFieldsValue({
        name: major.name,
        code: major.code,
        description: major.description ?? undefined,
      })
    }
  }, [form, major, open])

  const handleSubmit = async (values: MajorFormValues) => {
    if (isSubmitting) {
      return
    }

    const payload: MajorWriteRequest = {
      name: values.name.trim(),
      code: values.code.trim().toUpperCase(),
      description: values.description?.trim() || null,
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      const savedMajor = isEditing
        ? await updateMajor(major.id, payload)
        : await createMajor(payload)
      onSaved(savedMajor, isEditing ? 'edit' : 'create')
      form.resetFields()
    } catch (error) {
      setFormError(getApiErrorMessage(error, isEditing ? '保存专业失败' : '新增专业失败'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={isEditing ? '编辑专业' : '新增专业'}
      okText={isEditing ? '保存' : '创建'}
      cancelText="取消"
      confirmLoading={isSubmitting}
      okButtonProps={{ disabled: isSubmitting }}
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

      <Form<MajorFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={handleSubmit}
      >
        <Form.Item
          label="专业名称"
          name="name"
          rules={[
            { required: true, whitespace: true, message: '请输入专业名称' },
            { max: 100, message: '专业名称不能超过 100 个字符' },
          ]}
        >
          <Input placeholder="例如：网络安全" maxLength={100} autoFocus />
        </Form.Item>

        <Form.Item
          label="专业编码"
          name="code"
          rules={[
            { required: true, whitespace: true, message: '请输入专业编码' },
            { max: 50, message: '专业编码不能超过 50 个字符' },
          ]}
        >
          <Input placeholder="例如：SECURITY" maxLength={50} />
        </Form.Item>

        <Form.Item
          label="专业描述"
          name="description"
          rules={[{ max: 500, message: '专业描述不能超过 500 个字符' }]}
        >
          <Input.TextArea placeholder="请输入专业描述" maxLength={500} rows={4} showCount />
        </Form.Item>
      </Form>
    </Modal>
  )
}
