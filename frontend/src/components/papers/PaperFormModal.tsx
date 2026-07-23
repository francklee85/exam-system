import { Alert, Form, Input, Modal } from 'antd'
import { useEffect, useState } from 'react'

import { getApiErrorMessage } from '../../api/errors'
import { createPaper, updatePaper } from '../../api/papers'
import type { PaperDetail, PaperListItem } from '../../types/paper'

interface PaperFormValues {
  name: string
  description?: string
}

interface PaperFormModalProps {
  open: boolean
  paper: PaperListItem | PaperDetail | null
  onCancel: () => void
  onSaved: (paper: PaperDetail, mode: 'create' | 'edit') => void
}

export function PaperFormModal({
  open,
  paper,
  onCancel,
  onSaved,
}: PaperFormModalProps) {
  const [form] = Form.useForm<PaperFormValues>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const isEditing = paper !== null

  useEffect(() => {
    if (!open) {
      return
    }
    setFormError(null)
    form.setFieldsValue(
      paper === null
        ? { name: '', description: undefined }
        : {
            name: paper.name,
            description: paper.description ?? undefined,
          },
    )
  }, [form, open, paper])

  const handleSubmit = async (values: PaperFormValues) => {
    if (isSubmitting) {
      return
    }
    const payload = {
      name: values.name.trim(),
      description: values.description?.trim() || null,
    }
    setIsSubmitting(true)
    setFormError(null)
    try {
      const saved =
        paper === null
          ? await createPaper(payload)
          : await updatePaper(paper.id, payload)
      form.resetFields()
      onSaved(saved, paper === null ? 'create' : 'edit')
    } catch (error) {
      setFormError(
        getApiErrorMessage(error, paper === null ? '试卷创建失败' : '试卷保存失败'),
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={isEditing ? '编辑试卷信息' : '新增试卷'}
      okText={isEditing ? '保存' : '创建并组卷'}
      cancelText="取消"
      confirmLoading={isSubmitting}
      maskClosable={!isSubmitting}
      closable={!isSubmitting}
      destroyOnHidden
      onCancel={onCancel}
      onOk={() => form.submit()}
    >
      {formError !== null && (
        <Alert className="form-error-alert" type="error" showIcon message={formError} />
      )}
      <Form<PaperFormValues>
        form={form}
        name="paper-editor"
        layout="vertical"
        preserve={false}
        onFinish={handleSubmit}
      >
        <Form.Item
          label="试卷名称"
          name="name"
          rules={[{ required: true, whitespace: true, message: '请输入试卷名称' }]}
        >
          <Input maxLength={200} placeholder="例如：Linux 综合测试" />
        </Form.Item>
        <Form.Item label="试卷描述" name="description">
          <Input.TextArea
            rows={4}
            showCount
            placeholder="说明试卷用途或覆盖范围（可选）"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
