import { Alert, Form, Input, Modal } from 'antd'
import { useEffect, useState } from 'react'

import { createTeacher, updateTeacher } from '../../api/teachers'
import { getApiErrorMessage } from '../../api/errors'
import type {
  Teacher,
  TeacherCreateRequest,
  TeacherUpdateRequest,
} from '../../types/teacher'

interface TeacherFormValues {
  username: string
  real_name: string
  password?: string
  confirm_password?: string
}

interface TeacherFormModalProps {
  open: boolean
  teacher: Teacher | null
  onCancel: () => void
  onSaved: (teacher: Teacher, mode: 'create' | 'edit') => void
}

export function TeacherFormModal({
  open,
  teacher,
  onCancel,
  onSaved,
}: TeacherFormModalProps) {
  const [form] = Form.useForm<TeacherFormValues>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const isEditing = teacher !== null

  useEffect(() => {
    if (!open) {
      return
    }

    setFormError(null)
    form.resetFields()
    if (teacher !== null) {
      form.setFieldsValue({
        username: teacher.username,
        real_name: teacher.real_name,
      })
    }
  }, [form, open, teacher])

  const handleSubmit = async (values: TeacherFormValues) => {
    if (isSubmitting) {
      return
    }

    const identity: TeacherUpdateRequest = {
      username: values.username.trim(),
      real_name: values.real_name.trim(),
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      const savedTeacher = isEditing
        ? await updateTeacher(teacher.id, identity)
        : await createTeacher({
            ...identity,
            password: values.password ?? '',
          } satisfies TeacherCreateRequest)
      form.resetFields()
      onSaved(savedTeacher, isEditing ? 'edit' : 'create')
    } catch (error) {
      setFormError(getApiErrorMessage(error, isEditing ? '保存教师失败' : '新增教师失败'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      title={isEditing ? '编辑教师' : '新增教师'}
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

      <Form<TeacherFormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        onFinish={handleSubmit}
      >
        <Form.Item
          label="用户名"
          name="username"
          rules={[
            { required: true, whitespace: true, message: '请输入用户名' },
            { max: 50, message: '用户名不能超过 50 个字符' },
          ]}
        >
          <Input placeholder="例如：teacher001" maxLength={50} data-e2e="teacher-username" />
        </Form.Item>

        <Form.Item
          label="姓名"
          name="real_name"
          rules={[
            { required: true, whitespace: true, message: '请输入姓名' },
            { max: 50, message: '姓名不能超过 50 个字符' },
          ]}
        >
          <Input placeholder="例如：李老师" maxLength={50} data-e2e="teacher-real-name" />
        </Form.Item>

        {!isEditing && (
          <>
            <Form.Item
              label="初始密码"
              name="password"
              rules={[
                { required: true, message: '请输入初始密码' },
                { min: 8, message: '密码至少需要 8 个字符' },
                { max: 1024, message: '密码不能超过 1024 个字符' },
              ]}
            >
              <Input.Password
                placeholder="至少 8 个字符"
                autoComplete="new-password"
                data-e2e="teacher-password"
              />
            </Form.Item>

            <Form.Item
              label="确认密码"
              name="confirm_password"
              dependencies={['password']}
              rules={[
                { required: true, message: '请再次输入密码' },
                ({ getFieldValue }) => ({
                  validator: (_, value: string | undefined) =>
                    value === getFieldValue('password')
                      ? Promise.resolve()
                      : Promise.reject(new Error('两次输入的密码不一致')),
                }),
              ]}
            >
              <Input.Password
                placeholder="再次输入初始密码"
                autoComplete="new-password"
                data-e2e="teacher-confirm-password"
              />
            </Form.Item>
          </>
        )}
      </Form>
    </Modal>
  )
}
