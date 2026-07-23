import puppeteer from 'puppeteer-core'

const adminUsername = process.env.E2E_USERNAME
const adminPassword = process.env.E2E_PASSWORD
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://localhost:5173'
const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:8000'
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const screenshotPrefix = process.env.E2E_SCREENSHOT_PREFIX

if (!adminUsername || !adminPassword) {
  throw new Error('E2E_USERNAME and E2E_PASSWORD are required')
}

const suffix = Date.now().toString().slice(-8)
const teacher = {
  username: `question_teacher_${suffix}`,
  password: 'Question-Teacher-2026!',
  realName: '题库联调教师',
}
const student = {
  username: `question_student_${suffix}`,
  studentNo: `QS${suffix}`,
  password: 'Question-Student-2026!',
  realName: '题库联调学生',
}
const content = {
  single: `Linux 中查看当前工作目录的命令是？ [${suffix}]`,
  multiple: `以下哪些属于 Linux 常见文件系统？ [${suffix}]`,
  trueFalse: `Kubernetes 是一个容器编排系统。 [${suffix}]`,
}

const results = {
  teacherLogin: false,
  singleCreate: false,
  singleEdit: false,
  multipleCreate: false,
  trueFalseCreate: false,
  keywordFilter: false,
  typeFilter: false,
  difficultyFilter: false,
  teacherDisable: false,
  adminSeesTeacherQuestions: false,
  adminEditsTeacherQuestion: false,
  studentMenuHidden: false,
  studentForbidden: false,
  backendConsistent: false,
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

let page
let teacherAccount
let studentAccount
let createdClass
const createdQuestions = []
let currentStage = 'start'

try {
  currentStage = 'open-browser'
  page = await browser.newPage()
  await page.setViewport({ width: 1500, height: 1000 })
  page.setDefaultTimeout(20_000)

  currentStage = 'admin-setup-login'
  await login(page, adminUsername, adminPassword)
  currentStage = 'create-test-accounts'
  const setup = await page.evaluate(
    async ({ apiBaseUrl, teacherData, studentData, marker }) => {
      const token = window.localStorage.getItem('exam-system.access-token')
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
      const request = async (path, init = {}) => {
        const response = await fetch(`${apiBaseUrl}${path}`, {
          ...init,
          headers: { ...headers, ...init.headers },
        })
        const body = await response.json()
        if (!response.ok) {
          throw new Error(`${path}: ${response.status} ${JSON.stringify(body)}`)
        }
        return body
      }

      const teacherRecord = await request('/api/v1/teachers', {
        method: 'POST',
        body: JSON.stringify({
          username: teacherData.username,
          password: teacherData.password,
          real_name: teacherData.realName,
        }),
      })

      let classPage = await request('/api/v1/classes?page=1&page_size=1&status=active')
      let classRecord = classPage.items[0]
      let temporaryClass = null
      if (!classRecord) {
        const majorPage = await request(
          '/api/v1/majors?page=1&page_size=1&status=active',
        )
        const major = majorPage.items[0]
        if (!major) {
          throw new Error('No active major is available for student setup')
        }
        temporaryClass = await request('/api/v1/classes', {
          method: 'POST',
          body: JSON.stringify({
            major_id: major.id,
            name: `题库联调班级${marker}`,
            code: `QUESTION-E2E-${marker}`,
            enrollment_year: 2026,
            description: '题库浏览器联调临时班级',
          }),
        })
        classRecord = temporaryClass
      }

      const studentRecord = await request('/api/v1/students', {
        method: 'POST',
        body: JSON.stringify({
          username: studentData.username,
          password: studentData.password,
          real_name: studentData.realName,
          student_no: studentData.studentNo,
          class_id: classRecord.id,
        }),
      })
      return { teacherRecord, studentRecord, temporaryClass }
    },
    {
      apiBaseUrl: apiUrl,
      teacherData: teacher,
      studentData: student,
      marker: suffix,
    },
  )
  teacherAccount = setup.teacherRecord
  studentAccount = setup.studentRecord
  createdClass = setup.temporaryClass

  currentStage = 'teacher-login'
  await login(page, teacher.username, teacher.password)
  results.teacherLogin = true
  await page.goto(`${frontendUrl}/questions`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.textContent?.includes('题库管理'))

  currentStage = 'create-single'
  const single = await createChoiceQuestion(page, {
    type: 'single_choice',
    typeLabel: '单选题',
    content: content.single,
    optionContents: ['pwd', 'cd', 'mkdir', 'touch'],
    answers: ['A'],
    difficultyLabel: '简单',
    analysis: 'pwd 用于显示当前工作目录。',
  })
  createdQuestions.push(single)
  results.singleCreate =
    single.correct_answer.join(',') === 'A' &&
    single.options.map((option) => option.option_key).join(',') === 'A,B,C,D'

  currentStage = 'create-multiple'
  const multiple = await createChoiceQuestion(page, {
    type: 'multiple_choice',
    typeLabel: '多选题',
    content: content.multiple,
    optionContents: ['ext4', 'XFS', 'NTFS', 'Btrfs'],
    answers: ['A', 'B', 'D'],
    difficultyLabel: '中等',
    analysis: 'ext4、XFS 和 Btrfs 是 Linux 常见文件系统。',
  })
  createdQuestions.push(multiple)
  results.multipleCreate =
    multiple.question_type === 'multiple_choice' &&
    multiple.correct_answer.join(',') === 'A,B,D'

  currentStage = 'create-true-false'
  const trueFalse = await createTrueFalseQuestion(page)
  createdQuestions.push(trueFalse)
  results.trueFalseCreate =
    trueFalse.question_type === 'true_false' &&
    trueFalse.options.length === 0 &&
    trueFalse.correct_answer[0] === 'true'

  currentStage = 'keyword-filter'
  await searchByKeyword(page, suffix)
  await Promise.all([
    waitForTableText(page, content.single),
    waitForTableText(page, content.multiple),
    waitForTableText(page, content.trueFalse),
  ])
  results.keywordFilter = true

  currentStage = 'teacher-edit-search'
  await searchByKeyword(page, content.single)
  currentStage = 'teacher-edit-open'
  await clickVisibleSelector(page, `[data-e2e="edit-question-${single.id}"]`)
  await waitForDrawerOpen(page)
  await page.waitForSelector('#question-editor_analysis', { visible: true })
  await clearAndType(page, '#question-editor_analysis', 'pwd 解析已通过浏览器编辑。')
  currentStage = 'teacher-edit-save'
  const editResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/questions/${single.id}`) &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '保存')
  const editedSingle = await (await editResponse).json()
  await waitForDrawerClosed(page)
  results.singleEdit = editedSingle.analysis === 'pwd 解析已通过浏览器编辑。'

  currentStage = 'type-filter'
  await resetFilters(page)
  await selectOption(page, '[data-e2e="question-type-filter"]', '多选题')
  const typeResponse = waitForQuestionListResponse(page, 'question_type=multiple_choice')
  await clickButtonByText(page, '查询')
  await typeResponse
  await waitForTableText(page, content.multiple)
  results.typeFilter = true

  currentStage = 'difficulty-filter'
  await resetFilters(page)
  await clearAndType(page, '[data-e2e="question-keyword"]', suffix)
  await selectOption(page, '[data-e2e="question-difficulty-filter"]', '简单')
  const difficultyResponse = waitForQuestionListResponse(page, 'difficulty=easy')
  await clickButtonByText(page, '查询')
  await difficultyResponse
  await waitForTableText(page, content.single)
  results.difficultyFilter = true

  currentStage = 'teacher-disable'
  await searchByKeyword(page, content.single)
  await clickVisibleSelector(page, `[data-e2e="status-question-${single.id}"]`)
  const teacherStatusResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/questions/${single.id}/status`) &&
      response.request().method() === 'PATCH' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '确认')
  const disabledSingle = await (await teacherStatusResponse).json()
  results.teacherDisable = disabledSingle.status === 'disabled'

  currentStage = 'admin-login'
  await login(page, adminUsername, adminPassword)
  await page.goto(`${frontendUrl}/questions`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.textContent?.includes('题库管理'))
  await searchByKeyword(page, suffix)
  await Promise.all([
    waitForTableText(page, content.single),
    waitForTableText(page, content.multiple),
    waitForTableText(page, content.trueFalse),
  ])
  results.adminSeesTeacherQuestions = true

  currentStage = 'admin-edit'
  await searchByKeyword(page, content.multiple)
  await clickVisibleSelector(page, `[data-e2e="edit-question-${multiple.id}"]`)
  await waitForDrawerOpen(page)
  await page.waitForSelector('#question-editor_analysis', { visible: true })
  await clearAndType(page, '#question-editor_analysis', '管理员已验证并更新多选题解析。')
  const adminEditResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/questions/${multiple.id}`) &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '保存')
  const adminEdited = await (await adminEditResponse).json()
  await waitForDrawerClosed(page)
  results.adminEditsTeacherQuestion =
    adminEdited.analysis === '管理员已验证并更新多选题解析。' &&
    adminEdited.created_by.id === teacherAccount.id

  const backendState = await page.evaluate(
    async ({ apiBaseUrl, ids }) => {
      const token = window.localStorage.getItem('exam-system.access-token')
      return Promise.all(
        ids.map(async (id) => {
          const response = await fetch(`${apiBaseUrl}/api/v1/questions/${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          })
          return response.json()
        }),
      )
    },
    { apiBaseUrl: apiUrl, ids: createdQuestions.map((question) => question.id) },
  )
  results.backendConsistent =
    backendState.length === 3 &&
    backendState.every((question) => question.created_by.id === teacherAccount.id)

  currentStage = 'student-login-and-permission'
  await login(page, student.username, student.password)
  results.studentMenuHidden = await page.evaluate(
    () =>
      ![...document.querySelectorAll('.ant-menu-item')].some((item) =>
        item.textContent?.includes('题库管理'),
      ),
  )
  await page.goto(`${frontendUrl}/questions`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.location.pathname === '/403')
  results.studentForbidden = new URL(page.url()).pathname === '/403'

  if (screenshotPrefix) {
    await page.screenshot({
      path: `${screenshotPrefix}-student-forbidden.png`,
      fullPage: true,
    })
  }

  const failedChecks = Object.entries(results)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)
  console.log(
    JSON.stringify(
      {
        results,
        retainedDisabledTestData: {
          teacher: teacherAccount,
          student: studentAccount,
          questionIds: createdQuestions.map((question) => question.id),
          classId: createdClass?.id ?? null,
        },
      },
      null,
      2,
    ),
  )
  if (failedChecks.length > 0) {
    throw new Error(`Question browser checks failed: ${failedChecks.join(', ')}`)
  }
} catch (error) {
  console.error(`Question browser smoke failed at stage: ${currentStage}`)
  if (page && screenshotPrefix) {
    await page.screenshot({
      path: `${screenshotPrefix}-failure.png`,
      fullPage: true,
    })
  }
  throw error
} finally {
  if (page) {
    await disableTestData(page)
  }
  await browser.close()
}

async function createChoiceQuestion(
  page,
  { type, typeLabel, content: questionContent, optionContents, answers, difficultyLabel, analysis },
) {
  await page.click('[data-e2e="create-question"]')
  await waitForDrawerOpen(page)
  await page.waitForSelector('#question-editor_content', { visible: true })
  if (type !== 'single_choice') {
    await selectOption(page, '[data-e2e="question-type"]', typeLabel)
  }
  await selectOption(page, '[data-e2e="question-difficulty"]', difficultyLabel)
  await page.type('#question-editor_content', questionContent)
  for (const [index, key] of ['A', 'B', 'C', 'D'].entries()) {
    await page.type(`[aria-label="选项 ${key} 内容"]`, optionContents[index])
  }
  for (const key of answers) {
    await page.click(`[aria-label="选择 ${key} 为正确答案"]`)
  }
  await page.type('#question-editor_analysis', analysis)
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/questions') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  )
  await clickButtonByText(page, '创建')
  const question = await (await createResponse).json()
  await waitForDrawerClosed(page)
  return question
}

async function createTrueFalseQuestion(page) {
  await page.click('[data-e2e="create-question"]')
  await waitForDrawerOpen(page)
  await page.waitForSelector('#question-editor_content', { visible: true })
  await selectOption(page, '[data-e2e="question-type"]', '判断题')
  await selectOption(page, '[data-e2e="question-difficulty"]', '简单')
  await page.type('#question-editor_content', content.trueFalse)
  await page.click('[data-e2e="true-false-answer"] input[value="true"]')
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/questions') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  )
  await clickButtonByText(page, '创建')
  const question = await (await createResponse).json()
  await waitForDrawerClosed(page)
  return question
}

async function login(page, username, password) {
  await page.goto(`${frontendUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.evaluate(() => window.localStorage.clear())
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#username')
  await page.type('#username', username)
  await page.type('#password', password)
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith('/api/v1/auth/login') && candidate.status() === 200,
  )
  await clickButtonByText(page, '登录')
  await response
  await page.waitForFunction(() => window.location.pathname === '/dashboard')
}

async function searchByKeyword(page, keyword) {
  await clearAndType(page, '[data-e2e="question-keyword"]', keyword)
  const response = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url())
    return (
      url.pathname.endsWith('/api/v1/questions') &&
      url.searchParams.get('keyword') === keyword &&
      candidate.request().method() === 'GET' &&
      candidate.status() === 200
    )
  })
  await clickButtonByText(page, '查询')
  await response
}

async function resetFilters(page) {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().includes('/api/v1/questions?') &&
      candidate.request().method() === 'GET' &&
      candidate.status() === 200,
  )
  await clickButtonByText(page, '重置')
  await response
}

function waitForQuestionListResponse(page, queryFragment) {
  return page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/questions?') &&
      response.url().includes(queryFragment) &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  )
}

async function disableTestData(page) {
  await page.evaluate(
    async ({ apiBaseUrl, credentials, questionIds, teacherId, studentId, classId }) => {
      const loginResponse = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      })
      if (!loginResponse.ok) {
        return
      }
      const token = (await loginResponse.json()).access_token
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
      const disable = async (path) => {
        await fetch(`${apiBaseUrl}${path}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: 'disabled' }),
        })
      }
      await Promise.all(questionIds.map((id) => disable(`/api/v1/questions/${id}/status`)))
      if (teacherId) {
        await disable(`/api/v1/teachers/${teacherId}/status`)
      }
      if (studentId) {
        await disable(`/api/v1/students/${studentId}/status`)
      }
      if (classId) {
        await disable(`/api/v1/classes/${classId}/status`)
      }
    },
    {
      apiBaseUrl: apiUrl,
      credentials: { username: adminUsername, password: adminPassword },
      questionIds: createdQuestions.map((question) => question.id),
      teacherId: teacherAccount?.id,
      studentId: studentAccount?.id,
      classId: createdClass?.id,
    },
  )
}

async function selectOption(page, selector, label) {
  await page.click(selector)
  await page.waitForFunction(
    (expectedLabel) =>
      [...document.querySelectorAll('.ant-select-item-option-content')].some(
        (option) => {
          const bounds = option.closest('.ant-select-dropdown')?.getBoundingClientRect()
          return (
            option.textContent?.trim() === expectedLabel &&
            bounds !== undefined &&
            bounds.width > 0 &&
            bounds.height > 0
          )
        },
      ),
    {},
    label,
  )
  await page.evaluate((expectedLabel) => {
    const option = [...document.querySelectorAll('.ant-select-item-option-content')].find(
      (candidate) => {
        const bounds = candidate.closest('.ant-select-dropdown')?.getBoundingClientRect()
        return (
          candidate.textContent?.trim() === expectedLabel &&
          bounds !== undefined &&
          bounds.width > 0 &&
          bounds.height > 0
        )
      },
    )
    option?.parentElement?.click()
  }, label)
}

async function clickButtonByText(page, text) {
  await page.waitForFunction(
    (expectedText) =>
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent?.replace(/\s/gu, '') === expectedText,
      ),
    {},
    text,
  )
  await page.evaluate((expectedText) => {
    const button = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.replace(/\s/gu, '') === expectedText,
    )
    button?.click()
  }, text)
}

async function clearAndType(page, selector, value) {
  await page.waitForSelector(selector, { visible: true })
  await page.click(selector, { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type(selector, value)
}

async function clickVisibleSelector(page, selector) {
  await page.waitForFunction(
    (candidateSelector) =>
      [...document.querySelectorAll(candidateSelector)].some((element) => {
        const bounds = element.getBoundingClientRect()
        return bounds.width > 0 && bounds.height > 0
      }),
    {},
    selector,
  )
  await page.evaluate((candidateSelector) => {
    const element = [...document.querySelectorAll(candidateSelector)].find((candidate) => {
      const bounds = candidate.getBoundingClientRect()
      return bounds.width > 0 && bounds.height > 0
    })
    element?.click()
  }, selector)
}

async function waitForDrawerClosed(page) {
  await page.waitForSelector('.ant-drawer-content-wrapper', { hidden: true })
}

async function waitForDrawerOpen(page) {
  await page.waitForSelector('.ant-drawer-content-wrapper', { visible: true })
  await page.waitForFunction(() => {
    const wrapper = document.querySelector('.ant-drawer-content-wrapper')
    const bounds = wrapper?.getBoundingClientRect()
    return (
      bounds !== undefined &&
      bounds.width > 0 &&
      bounds.left >= 0 &&
      bounds.right <= window.innerWidth + 1
    )
  })
}

async function waitForTableText(page, text) {
  await page.waitForFunction(
    (expectedText) =>
      [...document.querySelectorAll('tbody tr')].some((row) =>
        row.textContent?.includes(expectedText),
      ),
    {},
    text,
  )
}
