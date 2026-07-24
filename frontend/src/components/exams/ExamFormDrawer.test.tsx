import { App as AntdApp } from 'antd'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getClass, listAllClasses } from '../../api/classes'
import { updateExam } from '../../api/exams'
import { listAllMajors } from '../../api/majors'
import { listAllPapers } from '../../api/papers'
import {
  cloudClass,
  cloudMajor,
} from '../../test/organizationFixtures'
import { draftExam } from '../../test/examFixtures'
import { activePaperDetail } from '../../test/paperFixtures'
import type { ClassInfo } from '../../types/class'
import type { Major } from '../../types/major'
import { ExamFormDrawer } from './ExamFormDrawer'

vi.mock('../../api/exams', () => ({
  createExam: vi.fn(),
  updateExam: vi.fn(),
}))
vi.mock('../../api/papers', () => ({
  listAllPapers: vi.fn(),
}))
vi.mock('../../api/majors', () => ({
  listAllMajors: vi.fn(),
}))
vi.mock('../../api/classes', () => ({
  getClass: vi.fn(),
  listAllClasses: vi.fn(),
}))

const mockedUpdateExam = vi.mocked(updateExam)
const mockedListAllPapers = vi.mocked(listAllPapers)
const mockedListAllMajors = vi.mocked(listAllMajors)
const mockedGetClass = vi.mocked(getClass)
const mockedListAllClasses = vi.mocked(listAllClasses)

const aiMajor: Major = {
  ...cloudMajor,
  id: 2,
  name: 'AIGC',
  code: 'AIGC',
}

const aiClass: ClassInfo = {
  ...cloudClass,
  id: 20,
  major_id: aiMajor.id,
  name: 'AIGC2501班',
  code: 'AIGC-2501',
  major: { id: aiMajor.id, name: aiMajor.name, code: aiMajor.code },
}

function renderDrawer(exam = null as typeof draftExam | null) {
  const onSaved = vi.fn()
  render(
    <AntdApp>
      <ExamFormDrawer
        open
        exam={exam}
        onCancel={vi.fn()}
        onSaved={onSaved}
      />
    </AntdApp>,
  )
  return { onSaved }
}

async function chooseOption(combobox: HTMLElement, label: string) {
  const user = userEvent.setup()
  await user.click(combobox)
  await user.click(
    await screen.findByText(label, { selector: '.ant-select-item-option-content' }),
  )
}

describe('exam form drawer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedListAllPapers.mockResolvedValue([activePaperDetail])
    mockedListAllMajors.mockResolvedValue([cloudMajor, aiMajor])
    mockedGetClass.mockResolvedValue(cloudClass)
    mockedListAllClasses.mockImplementation(async (filters = {}) =>
      filters.major_id === aiMajor.id ? [aiClass] : [cloudClass],
    )
    mockedUpdateExam.mockResolvedValue(draftExam)
  })

  it('loads only active papers and does not load organizations for all students', async () => {
    renderDrawer()
    expect(await screen.findByText('新增考试草稿')).toBeInTheDocument()
    await waitFor(() =>
      expect(mockedListAllPapers).toHaveBeenCalledWith({ status: 'active' }),
    )
    expect(screen.getByText('全部学生')).toBeInTheDocument()
    expect(mockedListAllMajors).not.toHaveBeenCalled()
    expect(mockedListAllClasses).not.toHaveBeenCalled()
  })

  it('loads active majors when major target is selected', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await screen.findByText('新增考试草稿')
    await user.click(screen.getByText('指定专业'))
    await waitFor(() => expect(mockedListAllMajors).toHaveBeenCalledWith('active'))
    expect(screen.getByText('专业')).toBeInTheDocument()
    expect(mockedListAllClasses).not.toHaveBeenCalled()
  })

  it('loads classes for the selected active major', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await screen.findByText('新增考试草稿')
    await user.click(screen.getByText('指定班级'))
    await waitFor(() => expect(mockedListAllMajors).toHaveBeenCalledWith('active'))
    await chooseOption(
      screen.getByRole('combobox', { name: '专业（用于筛选班级）' }),
      '云计算 / CLOUD',
    )
    await waitFor(() =>
      expect(mockedListAllClasses).toHaveBeenCalledWith({
        major_id: cloudMajor.id,
        status: 'active',
      }),
    )
  })

  it('clears the old class when switching the helper major', async () => {
    const user = userEvent.setup()
    renderDrawer()
    await screen.findByText('新增考试草稿')
    await user.click(screen.getByText('指定班级'))
    await chooseOption(
      screen.getByRole('combobox', { name: '专业（用于筛选班级）' }),
      '云计算 / CLOUD',
    )
    await chooseOption(
      screen.getByRole('combobox', { name: '班级' }),
      '云计算2501班 / CLOUD-2501',
    )
    expect(
      document.querySelector(
        '.ant-select-selection-item[title="云计算2501班 / CLOUD-2501"]',
      ),
    ).not.toBeNull()
    await chooseOption(
      screen.getByRole('combobox', { name: '专业（用于筛选班级）' }),
      'AIGC / AIGC',
    )
    await waitFor(() =>
      expect(mockedListAllClasses).toHaveBeenLastCalledWith({
        major_id: aiMajor.id,
        status: 'active',
      }),
    )
    expect(
      document.querySelector(
        '.ant-select-selection-item[title="云计算2501班 / CLOUD-2501"]',
      ),
    ).toBeNull()
  })

  it('recovers the helper major and class when editing a class target', async () => {
    renderDrawer(draftExam)
    expect(await screen.findByText('编辑考试草稿')).toBeInTheDocument()
    await waitFor(() => expect(mockedGetClass).toHaveBeenCalledWith(cloudClass.id))
    expect(mockedListAllMajors).toHaveBeenCalledWith('active')
    expect(mockedListAllClasses).toHaveBeenCalledWith({
      major_id: cloudMajor.id,
      status: 'active',
    })
    expect(screen.getByText('云计算 / CLOUD')).toBeInTheDocument()
    expect(screen.getByText('云计算2501班 / CLOUD-2501')).toBeInTheDocument()
  })

  it('submits only the class id as target and preserves UTC datetime contract', async () => {
    const { onSaved } = renderDrawer(draftExam)
    await screen.findByText('编辑考试草稿')
    await screen.findByText('云计算2501班 / CLOUD-2501')
    const user = userEvent.setup()
    await user.click(screen.getByText('保存草稿'))
    await waitFor(() => expect(mockedUpdateExam).toHaveBeenCalled())
    const payload = mockedUpdateExam.mock.calls[0]?.[1]
    expect(payload).toMatchObject({
      paper_id: draftExam.paper.id,
      start_time: draftExam.start_time,
      end_time: draftExam.end_time,
      duration_minutes: 90,
      pass_score: '6.00',
      target: { target_type: 'class', target_id: cloudClass.id },
    })
    expect(payload?.target).not.toHaveProperty('major_id')
    expect(payload).not.toHaveProperty('total_score')
    expect(payload).not.toHaveProperty('created_by')
    expect(onSaved).toHaveBeenCalledWith(draftExam, 'edit')
  })

  it('validates pass score against the active paper total', async () => {
    renderDrawer(draftExam)
    await screen.findByText('编辑考试草稿')
    const user = userEvent.setup()
    const passScore = screen.getByRole('spinbutton', { name: '及格分' })
    await user.clear(passScore)
    await user.type(passScore, '11')
    await user.click(screen.getByText('保存草稿'))
    expect(
      await screen.findByText('及格分不能超过所选试卷总分'),
    ).toBeInTheDocument()
    expect(mockedUpdateExam).not.toHaveBeenCalled()
  })
})
