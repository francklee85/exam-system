import { DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { Button, Checkbox, Input, Radio, Space, Typography } from 'antd'

import type { QuestionType } from '../../types/question'
import { optionKeyFromIndex } from '../../utils/questionOptions'

export interface EditableChoiceOption {
  id: string
  content: string
}

interface ChoiceOptionsEditorProps {
  questionType: Extract<QuestionType, 'single_choice' | 'multiple_choice'>
  options: EditableChoiceOption[]
  selectedOptionIds: string[]
  onOptionsChange: (options: EditableChoiceOption[]) => void
  onSelectedOptionIdsChange: (optionIds: string[]) => void
  createOption: () => EditableChoiceOption
}

export function ChoiceOptionsEditor({
  questionType,
  options,
  selectedOptionIds,
  onOptionsChange,
  onSelectedOptionIdsChange,
  createOption,
}: ChoiceOptionsEditorProps) {
  const isSingleChoice = questionType === 'single_choice'

  const updateContent = (optionId: string, content: string) => {
    onOptionsChange(
      options.map((option) => (option.id === optionId ? { ...option, content } : option)),
    )
  }

  const removeOption = (optionId: string) => {
    onOptionsChange(options.filter((option) => option.id !== optionId))
    onSelectedOptionIdsChange(selectedOptionIds.filter((id) => id !== optionId))
  }

  return (
    <div className="choice-options-editor">
      <div className="choice-options-heading">
        <div>
          <Typography.Text strong>题目选项</Typography.Text>
          <Typography.Text type="secondary">
            {isSingleChoice ? '选择一个正确答案' : '至少选择两个正确答案'}
          </Typography.Text>
        </div>
        <Button
          icon={<PlusOutlined />}
          onClick={() => onOptionsChange([...options, createOption()])}
          data-e2e="add-question-option"
        >
          新增选项
        </Button>
      </div>

      <Space className="choice-option-list" direction="vertical" size={12}>
        {options.map((option, index) => {
          const optionKey = optionKeyFromIndex(index)
          const isSelected = selectedOptionIds.includes(option.id)
          return (
            <div className="choice-option-row" key={option.id}>
              {isSingleChoice ? (
                <Radio
                  aria-label={`选择 ${optionKey} 为正确答案`}
                  checked={isSelected}
                  onChange={() => onSelectedOptionIdsChange([option.id])}
                />
              ) : (
                <Checkbox
                  aria-label={`选择 ${optionKey} 为正确答案`}
                  checked={isSelected}
                  onChange={(event) => {
                    onSelectedOptionIdsChange(
                      event.target.checked
                        ? [...selectedOptionIds, option.id]
                        : selectedOptionIds.filter((id) => id !== option.id),
                    )
                  }}
                />
              )}
              <span className="choice-option-key">{optionKey}</span>
              <Input
                aria-label={`选项 ${optionKey} 内容`}
                placeholder={`请输入选项 ${optionKey} 的内容`}
                value={option.content}
                onChange={(event) => updateContent(option.id, event.target.value)}
              />
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                aria-label={`删除选项 ${optionKey}`}
                onClick={() => removeOption(option.id)}
              />
            </div>
          )
        })}
      </Space>
    </div>
  )
}
