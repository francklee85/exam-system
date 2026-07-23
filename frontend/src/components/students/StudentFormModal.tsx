import { Alert, Form, Input, Modal, Select } from 'antd'
import { useEffect, useMemo, useState } from 'react'

import { createStudent, updateStudent } from '../../api/students'
import { getApiErrorMessage } from '../../api/errors'
import { useClassOptions } from '../../hooks/useClassOptions'
import type { Major } from '../../types/major'
import type {
  Student,
  StudentCreateRequest,
  StudentUpdateRequest,
} from '../../types/student'

interface StudentFormValues {
  student_no: string
  username: string
  real_name: string
  password?: string
  confirm_password?: string
  major_id: number
  class_id: number
}

interface StudentFormModalProps {
  open: boolean
  student: Student | null
  activeMajors: Major[]
  majorsLoading: boolean
  majorsError: unknown
  onCancel: () => void
  onSaved: (student: Student, mode: 'create' | 'edit') => void
}

export function StudentFormModal({
  open,
  student,
  activeMajors,
  majorsLoading,
  majorsError,
  onCancel,
  onSaved,
}: StudentFormModalProps) {
  const [form] = Form.useForm<StudentFormValues>()
  const [selectedMajorId, setSelectedMajorId] = useState<number>()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const isEditing = student !== null
  const activeClassOptions = useClassOptions({
    majorId: selectedMajorId,
    status: 'active',
    enabled: open && selectedMajorId !== undefined,
  })

  useEffect(() => {
    if (!open) {
      return
    }

    setFormError(null)
    form.resetFields()
    if (student === null) {
      setSelectedMajorId(undefined)
    } else {
      setSelectedMajorId(student.major.id)
      form.setFieldsValue({
        student_no: student.student_no,
        username: student.username,
        real_name: student.real_name,
        major_id: student.major.id,
        class_id: student.class.id,
      })
    }
  }, [form, open, student])

  const majorOptions = useMemo(() => {
    const options: Array<{ value: number; label: string; disabled?: boolean }> = activeMajors.map(
      (major) => ({
        value: major.id,
        label: `${major.name} / ${major.code}`,
      }),
    )

    if (student !== null && !activeMajors.some((major) => major.id === student.major.id)) {
      options.unshift({
        value: student.major.id,
        label: `${student.major.name} / ${student.major.code}（已禁用）`,
        disabled: true,
      })
    }
    return options
  }, [activeMajors, student])

  const classOptions = useMemo(() => {
    const options: Array<{ value: number; label: string; disabled?: boolean }> =
      activeClassOptions.classes.map((classInfo) => ({
        value: classInfo.id,
        label: `${classInfo.name} / ${classInfo.code}`,
      }))

    if (
      student !== null &&
      selectedMajorId === student.major.id &&
      !activeClassOptions.classes.some((classInfo) => classInfo.id === student.class.id)
    ) {
      options.unshift({
        value: student.class.id,
        label: `${student.class.name} / ${student.class.code}（已禁用）`,
        disabled: true,
      })
    }
    return options
  }, [activeClassOptions.classes, selectedMajorId, student])

  const handleSubmit = async (values: StudentFormValues) => {
    if (isSubmitting) {
      return
    }

    const identity: StudentUpdateRequest = {
      student_no: values.student_no.trim(),
      username: values.username.trim(),
      real_name: values.real_name.trim(),
      class_id: values.class_id,
    }

    setIsSubmitting(true)
    setFormError(null)
    try {
      const savedStudent = isEditing
        ? await updateStudent(student.id, identity)
        : await createStudent({
            ...identity,
            password: values.password ?? '',
          } satisfies StudentCreateRequest)
      form.resetFields()
      setSelectedMajorId(undefined)
      onSaved(savedStudent, isEditing ? 'edit' : 'create')
    } catch (error) {
      setFormError(getApiErrorMessage(error, isEditing ? '保存学生失败' : '新增学生失败'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const classOptionsUnavailable =
    selectedMajorId !== undefined && activeClassOptions.error !== null

  return (
    <Modal
      open={open}
      title={isEditing ? '编辑学生' : '新增学生'}
      okText={isEditing ? '保存' : '创建'}
      cancelText="取消"
      width={640}
      confirmLoading={isSubmitting}
      okButtonProps={{
        disabled:
          isSubmitting ||
          majorsLoading ||
          majorsError !== null ||
          activeClassOptions.isLoading ||
          classOptionsUnavailable,
      }}
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
        <Alert className="form-error-alert" type="error" showIcon message="专业选项加载失败" />
      )}
      {classOptionsUnavailable && (
        <Alert
          className="form-error-alert"
          type="error"
          showIcon
          message="班级选项加载失败，请重新选择专业后重试"
        />
      )}

      <Form<StudentFormValues>
        form={form}
        name="student-editor"
        className="student-form"
        layout="vertical"
        requiredMark={false}
        onFinish={handleSubmit}
        onValuesChange={(changedValues) => {
          if ('major_id' in changedValues) {
            const majorId = changedValues.major_id as number | undefined
            setSelectedMajorId(majorId)
            form.setFieldValue('class_id', undefined)
          }
        }}
      >
        <Form.Item
          label="学号"
          name="student_no"
          rules={[
            { required: true, whitespace: true, message: '请输入学号' },
            { max: 50, message: '学号不能超过 50 个字符' },
          ]}
        >
          <Input placeholder="例如：20260001" maxLength={50} data-e2e="student-no" />
        </Form.Item>

        <Form.Item
          label="用户名"
          name="username"
          rules={[
            { required: true, whitespace: true, message: '请输入用户名' },
            { max: 50, message: '用户名不能超过 50 个字符' },
          ]}
        >
          <Input placeholder="例如：20260001" maxLength={50} data-e2e="student-username" />
        </Form.Item>

        <Form.Item
          label="姓名"
          name="real_name"
          rules={[
            { required: true, whitespace: true, message: '请输入姓名' },
            { max: 50, message: '姓名不能超过 50 个字符' },
          ]}
        >
          <Input placeholder="例如：张三" maxLength={50} data-e2e="student-real-name" />
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
                data-e2e="student-password"
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
                data-e2e="student-confirm-password"
              />
            </Form.Item>
          </>
        )}

        <Form.Item
          label="专业"
          name="major_id"
          rules={[{ required: true, message: '请选择专业' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="请选择启用中的专业"
            loading={majorsLoading}
            options={majorOptions}
            data-e2e="student-major-select"
          />
        </Form.Item>

        <Form.Item
          label="班级"
          name="class_id"
          rules={[{ required: true, message: '请选择班级' }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={selectedMajorId === undefined ? '请先选择专业' : '请选择启用中的班级'}
            disabled={selectedMajorId === undefined}
            loading={activeClassOptions.isLoading}
            options={classOptions}
            data-e2e="student-class-select"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
