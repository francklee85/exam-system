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
  username: `paper_teacher_${suffix}`,
  password: 'Paper-Teacher-2026!',
  realName: '试卷联调教师',
}
const student = {
  username: `paper_student_${suffix}`,
  studentNo: `PS${suffix}`,
  password: 'Paper-Student-2026!',
  realName: '试卷联调学生',
}
const paperName = `Linux 综合测试 [${suffix}]`
const questionContents = {
  single: `Linux 中查看当前工作目录的命令是？ [${suffix}]`,
  multiple: `以下哪些属于 Linux 常见文件系统？ [${suffix}]`,
  trueFalse: `Kubernetes 是一个容器编排系统。 [${suffix}]`,
  disabled: `这是一道不可加入试卷的禁用题 [${suffix}]`,
}

const results = {
  teacherLogin: false,
  createAndEnterDetail: false,
  selectorOnlyRequestsActive: false,
  filtersPassedToQuestionApi: false,
  batchAddedWithScores: false,
  duplicateSelectionBlocked: false,
  scoreUpdatedAndTotalAuthoritative: false,
  reorderPersistedAfterRefresh: false,
  relationRemovedAndTotalUpdated: false,
  disabledQuestionRejected: false,
  validQuestionReadded: false,
  activeLocksComposition: false,
  adminSeesTeacherPaper: false,
  adminCanManageTeacherPaper: false,
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
let paper
const questions = []
let currentStage = 'start'

try {
  page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1100 })
  page.setDefaultTimeout(25_000)

  currentStage = 'admin-setup-login'
  await login(page, adminUsername, adminPassword)
  currentStage = 'create-test-accounts'
  const setup = await setupAccounts(page)
  teacherAccount = setup.teacherRecord
  studentAccount = setup.studentRecord
  createdClass = setup.temporaryClass

  currentStage = 'teacher-login'
  await login(page, teacher.username, teacher.password)
  results.teacherLogin = true

  currentStage = 'create-test-questions'
  questions.push(...(await createQuestions(page)))
  const [single, multiple, trueFalse, disabled] = questions

  currentStage = 'open-papers'
  await page.goto(`${frontendUrl}/papers`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.textContent?.includes('试卷管理'))

  currentStage = 'create-paper'
  await page.click('[data-e2e="create-paper"]')
  await page.waitForSelector('#paper-editor_name', { visible: true })
  await page.type('#paper-editor_name', paperName)
  await page.type('#paper-editor_description', '浏览器真实联调人工组卷')
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/papers') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  )
  await clickButtonByText(page, '创建并组卷')
  paper = await (await createResponse).json()
  await page.waitForFunction(
    (paperId) => window.location.pathname === `/papers/${paperId}`,
    {},
    paper.id,
  )
  await waitForText(page, paperName)
  results.createAndEnterDetail =
    paper.status === 'draft' &&
    paper.total_score === '0.00' &&
    paper.question_count === 0

  currentStage = 'open-selector'
  await openQuestionSelector(page)
  await clearAndType(page, '[data-e2e="paper-question-keyword"]', suffix)
  await selectOption(page, '[data-e2e="paper-question-type"]', '单选题')
  await selectOption(page, '[data-e2e="paper-question-difficulty"]', '简单')
  const filteredResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      url.pathname.endsWith('/api/v1/questions') &&
      url.searchParams.get('status') === 'active' &&
      url.searchParams.get('keyword') === suffix &&
      url.searchParams.get('question_type') === 'single_choice' &&
      url.searchParams.get('difficulty') === 'easy' &&
      response.request().method() === 'GET' &&
      response.status() === 200
    )
  })
  await clickButtonByText(page, '查询')
  const filteredBody = await (await filteredResponsePromise).json()
  results.selectorOnlyRequestsActive =
    filteredBody.items.every((item) => item.status === 'active') &&
    !filteredBody.items.some((item) => item.id === disabled.id)
  results.filtersPassedToQuestionApi = filteredBody.items.some(
    (item) => item.id === single.id,
  )

  currentStage = 'reset-selector-query'
  await clearAndType(page, '[data-e2e="paper-question-keyword"]', suffix)
  await clearAntSelect(page, '[data-e2e="paper-question-type"]')
  await clearAntSelect(page, '[data-e2e="paper-question-difficulty"]')
  const activeQuestionResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      url.pathname.endsWith('/api/v1/questions') &&
      url.searchParams.get('status') === 'active' &&
      url.searchParams.get('keyword') === suffix &&
      !url.searchParams.has('question_type') &&
      !url.searchParams.has('difficulty') &&
      response.request().method() === 'GET' &&
      response.status() === 200
    )
  })
  await clickButtonByText(page, '查询')
  await activeQuestionResponse
  await Promise.all([
    waitForTableText(page, questionContents.single),
    waitForTableText(page, questionContents.multiple),
    waitForTableText(page, questionContents.trueFalse),
  ])

  currentStage = 'select-three-questions'
  for (const question of [single, multiple, trueFalse]) {
    await page.click(`[aria-label="选择题目 ${question.id}"]`)
  }
  await setNumberInput(page, `题目 ${single.id} 分值`, '2')
  await setNumberInput(page, `题目 ${multiple.id} 分值`, '5')
  await setNumberInput(page, `题目 ${trueFalse.id} 分值`, '3')
  const batchResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/papers/${paper.id}/questions`) &&
      response.request().method() === 'POST' &&
      response.status() === 200,
  )
  await page.click('[data-e2e="confirm-add-paper-questions"]')
  paper = await (await batchResponse).json()
  await waitForDrawerClosed(page)
  await waitForTotal(page, '10.00')
  results.batchAddedWithScores =
    paper.question_count === 3 &&
    paper.total_score === '10.00' &&
    paper.questions.map((item) => item.score).join(',') === '2.00,5.00,3.00'

  currentStage = 'verify-duplicate-prevention'
  await openQuestionSelector(page)
  await clearAndType(page, '[data-e2e="paper-question-keyword"]', questionContents.single)
  const duplicateResponse = waitForQuestionList(page, questionContents.single)
  await clickButtonByText(page, '查询')
  await duplicateResponse
  await page.waitForSelector(`[aria-label="题目 ${single.id} 已加入"]`)
  results.duplicateSelectionBlocked = await page.$eval(
    `[aria-label="题目 ${single.id} 已加入"]`,
    (element) => element.disabled,
  )
  await closeDrawer(page)

  currentStage = 'update-score'
  await page.click(`[aria-label="修改题目 ${single.id} 分值"]`)
  await page.waitForSelector('[aria-label="题目分值"]', { visible: true })
  await setNumberInput(page, '题目分值', '2.5')
  const scoreResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/papers/${paper.id}/questions/${single.id}`) &&
      response.request().method() === 'PATCH' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '保存')
  paper = await (await scoreResponse).json()
  await waitForTotal(page, '10.50')
  results.scoreUpdatedAndTotalAuthoritative =
    paper.total_score === '10.50' &&
    paper.questions.find((item) => item.question_id === single.id)?.score === '2.50'

  currentStage = 'reorder'
  const beforeOrder = paper.questions.map((item) => item.question_id)
  const reorderResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/papers/${paper.id}/questions/order`) &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
  )
  await page.$eval(
    `[aria-label="下移题目 ${beforeOrder[0]}"]`,
    (element) => element.click(),
  )
  paper = await (await reorderResponse).json()
  const reorderedIds = paper.questions.map((item) => item.question_id)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await waitForText(page, paperName)
  const refreshedPaper = await getPaperFromBrowser(page, paper.id)
  results.reorderPersistedAfterRefresh =
    reorderedIds.join(',') === refreshedPaper.questions.map((item) => item.question_id).join(',') &&
    reorderedIds[0] === beforeOrder[1] &&
    refreshedPaper.questions.every((item, index) => item.sort_order === index + 1)
  paper = refreshedPaper

  currentStage = 'remove-true-false'
  await page.click(`[aria-label="从试卷移除题目 ${trueFalse.id}"]`)
  const removeResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/papers/${paper.id}/questions/${trueFalse.id}`) &&
      response.request().method() === 'DELETE' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '确认移除')
  paper = await (await removeResponse).json()
  await waitForTotal(page, '7.50')
  results.relationRemovedAndTotalUpdated =
    paper.question_count === 2 &&
    paper.total_score === '7.50' &&
    !paper.questions.some((item) => item.question_id === trueFalse.id) &&
    paper.questions.every((item, index) => item.sort_order === index + 1)

  currentStage = 'direct-disabled-question-rejection'
  const disabledAttempt = await page.evaluate(
    async ({ apiBaseUrl, paperId, questionId }) => {
      const token = window.localStorage.getItem('exam-system.access-token')
      const response = await fetch(`${apiBaseUrl}/api/v1/papers/${paperId}/questions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [{ question_id: questionId, score: '3.00' }],
        }),
      })
      return { status: response.status, body: await response.json() }
    },
    { apiBaseUrl: apiUrl, paperId: paper.id, questionId: disabled.id },
  )
  const afterDisabledAttempt = await getPaperFromBrowser(page, paper.id)
  results.disabledQuestionRejected =
    disabledAttempt.status === 409 &&
    afterDisabledAttempt.question_count === 2 &&
    afterDisabledAttempt.total_score === '7.50'

  currentStage = 'readd-valid-question'
  await openQuestionSelector(page)
  await clearAndType(page, '[data-e2e="paper-question-keyword"]', questionContents.trueFalse)
  const validResponse = waitForQuestionList(page, questionContents.trueFalse)
  await clickButtonByText(page, '查询')
  await validResponse
  await page.click(`[aria-label="选择题目 ${trueFalse.id}"]`)
  await setNumberInput(page, `题目 ${trueFalse.id} 分值`, '3')
  const readdResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/papers/${paper.id}/questions`) &&
      response.request().method() === 'POST' &&
      response.status() === 200,
  )
  await page.click('[data-e2e="confirm-add-paper-questions"]')
  paper = await (await readdResponse).json()
  await waitForDrawerClosed(page)
  await waitForTotal(page, '10.50')
  results.validQuestionReadded =
    paper.question_count === 3 && paper.total_score === '10.50'

  currentStage = 'activate-paper'
  await page.click('[data-e2e="paper-status-active"]')
  const activateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/papers/${paper.id}/status`) &&
      response.request().method() === 'PATCH' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '确认')
  paper = await (await activateResponse).json()
  await waitForText(page, '试卷已启用，如需修改请先调整为草稿状态。')
  results.activeLocksComposition =
    paper.status === 'active' &&
    (await page.$('[data-e2e="add-paper-questions"]')) === null &&
    (await page.$(`[aria-label="修改题目 ${single.id} 分值"]`)) === null &&
    (await page.$(`[aria-label="从试卷移除题目 ${single.id}"]`)) === null

  currentStage = 'admin-view-and-manage'
  await login(page, adminUsername, adminPassword)
  await page.goto(`${frontendUrl}/papers`, { waitUntil: 'domcontentloaded' })
  await waitForText(page, '试卷管理')
  await clearAndType(page, '[data-e2e="paper-keyword"]', suffix)
  const adminListResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      url.pathname.endsWith('/api/v1/papers') &&
      url.searchParams.get('keyword') === suffix &&
      response.request().method() === 'GET' &&
      response.status() === 200
    )
  })
  await clickButtonByText(page, '查询')
  const adminList = await (await adminListResponse).json()
  results.adminSeesTeacherPaper = adminList.items.some(
    (item) => item.id === paper.id && item.creator.id === teacherAccount.id,
  )
  await page.click(`[data-e2e="view-paper-${paper.id}"]`)
  await waitForText(page, paperName)
  await page.click('[data-e2e="paper-status-draft"]')
  const adminStatusResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/papers/${paper.id}/status`) &&
      response.request().method() === 'PATCH' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '确认')
  paper = await (await adminStatusResponse).json()
  results.adminCanManageTeacherPaper =
    paper.status === 'draft' &&
    paper.creator.id === teacherAccount.id &&
    (await page.$('[data-e2e="add-paper-questions"]')) !== null

  currentStage = 'backend-consistency'
  const backendPaper = await getPaperFromBrowser(page, paper.id)
  results.backendConsistent =
    backendPaper.total_score === '10.50' &&
    backendPaper.question_count === 3 &&
    backendPaper.questions.every((item, index) => item.sort_order === index + 1)

  currentStage = 'student-permission'
  await login(page, student.username, student.password)
  results.studentMenuHidden = await page.evaluate(
    () =>
      ![...document.querySelectorAll('.ant-menu-item')].some((item) =>
        item.textContent?.includes('试卷管理'),
      ),
  )
  await page.goto(`${frontendUrl}/papers`, { waitUntil: 'domcontentloaded' })
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
          paperId: paper.id,
          teacherId: teacherAccount.id,
          studentId: studentAccount.id,
          questionIds: questions.map((question) => question.id),
          classId: createdClass?.id ?? null,
        },
      },
      null,
      2,
    ),
  )
  if (failedChecks.length > 0) {
    throw new Error(`Paper browser checks failed: ${failedChecks.join(', ')}`)
  }
} catch (error) {
  console.error(`Paper browser smoke failed at stage: ${currentStage}`)
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

async function setupAccounts(page) {
  return page.evaluate(
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
      const classPage = await request('/api/v1/classes?page=1&page_size=1&status=active')
      let classRecord = classPage.items[0]
      let temporaryClass = null
      if (!classRecord) {
        const majorPage = await request('/api/v1/majors?page=1&page_size=1&status=active')
        const major = majorPage.items[0]
        if (!major) {
          throw new Error('No active major is available for student setup')
        }
        temporaryClass = await request('/api/v1/classes', {
          method: 'POST',
          body: JSON.stringify({
            major_id: major.id,
            name: `试卷联调班级${marker}`,
            code: `PAPER-E2E-${marker}`,
            enrollment_year: 2026,
            description: '试卷浏览器联调临时班级',
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
}

async function createQuestions(page) {
  return page.evaluate(
    async ({ apiBaseUrl, contents }) => {
      const token = window.localStorage.getItem('exam-system.access-token')
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
      const request = async (path, init) => {
        const response = await fetch(`${apiBaseUrl}${path}`, { ...init, headers })
        const body = await response.json()
        if (!response.ok) {
          throw new Error(`${path}: ${response.status} ${JSON.stringify(body)}`)
        }
        return body
      }
      const option = (option_key, option_content, sort_order) => ({
        option_key,
        option_content,
        sort_order,
      })
      const single = await request('/api/v1/questions', {
        method: 'POST',
        body: JSON.stringify({
          question_type: 'single_choice',
          content: contents.single,
          options: [
            option('A', 'pwd', 1),
            option('B', 'cd', 2),
            option('C', 'mkdir', 3),
            option('D', 'touch', 4),
          ],
          correct_answer: ['A'],
          analysis: 'pwd 用于显示当前工作目录。',
          difficulty: 'easy',
        }),
      })
      const multiple = await request('/api/v1/questions', {
        method: 'POST',
        body: JSON.stringify({
          question_type: 'multiple_choice',
          content: contents.multiple,
          options: [
            option('A', 'ext4', 1),
            option('B', 'XFS', 2),
            option('C', 'NTFS', 3),
            option('D', 'Btrfs', 4),
          ],
          correct_answer: ['A', 'B', 'D'],
          analysis: 'ext4、XFS 和 Btrfs 是 Linux 常见文件系统。',
          difficulty: 'medium',
        }),
      })
      const trueFalse = await request('/api/v1/questions', {
        method: 'POST',
        body: JSON.stringify({
          question_type: 'true_false',
          content: contents.trueFalse,
          options: [],
          correct_answer: ['true'],
          analysis: 'Kubernetes 用于容器编排。',
          difficulty: 'easy',
        }),
      })
      const disabled = await request('/api/v1/questions', {
        method: 'POST',
        body: JSON.stringify({
          question_type: 'true_false',
          content: contents.disabled,
          options: [],
          correct_answer: ['false'],
          analysis: null,
          difficulty: 'hard',
        }),
      })
      await request(`/api/v1/questions/${disabled.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'disabled' }),
      })
      return [single, multiple, trueFalse, { ...disabled, status: 'disabled' }]
    },
    { apiBaseUrl: apiUrl, contents: questionContents },
  )
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

async function getPaperFromBrowser(page, paperId) {
  return page.evaluate(
    async ({ apiBaseUrl, id }) => {
      const token = window.localStorage.getItem('exam-system.access-token')
      const response = await fetch(`${apiBaseUrl}/api/v1/papers/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        throw new Error(`GET paper failed: ${response.status}`)
      }
      return response.json()
    },
    { apiBaseUrl: apiUrl, id: paperId },
  )
}

async function openQuestionSelector(page) {
  const initialResponse = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      url.pathname.endsWith('/api/v1/questions') &&
      url.searchParams.get('status') === 'active' &&
      response.request().method() === 'GET' &&
      response.status() === 200
    )
  })
  await page.click('[data-e2e="add-paper-questions"]')
  await waitForDrawerOpen(page)
  await initialResponse
}

function waitForQuestionList(page, keyword) {
  return page.waitForResponse((response) => {
    const url = new URL(response.url())
    return (
      url.pathname.endsWith('/api/v1/questions') &&
      url.searchParams.get('keyword') === keyword &&
      url.searchParams.get('status') === 'active' &&
      response.request().method() === 'GET' &&
      response.status() === 200
    )
  })
}

async function disableTestData(page) {
  await page.evaluate(
    async ({
      apiBaseUrl,
      credentials,
      paperId,
      questionIds,
      teacherId,
      studentId,
      classId,
    }) => {
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
      if (paperId) {
        await disable(`/api/v1/papers/${paperId}/status`)
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
      paperId: paper?.id,
      questionIds: questions.map((question) => question.id),
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

async function clearAntSelect(page, selector) {
  await page.hover(selector)
  const clearSelector = `${selector} .ant-select-clear`
  await page.waitForSelector(clearSelector, { visible: true })
  await page.click(clearSelector)
}

async function setNumberInput(page, ariaLabel, value) {
  const selector = `[aria-label="${ariaLabel}"]`
  await page.waitForSelector(selector, { visible: true })
  await page.click(selector, { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type(selector, value)
  await page.keyboard.press('Tab')
}

async function clickButtonByText(page, text) {
  await page.waitForFunction(
    (expectedText) =>
      [...document.querySelectorAll('button')].some(
        (button) =>
          button.textContent?.replace(/\s/gu, '') === expectedText &&
          !button.disabled &&
          button.getBoundingClientRect().width > 0,
      ),
    {},
    text,
  )
  await page.evaluate((expectedText) => {
    const button = [...document.querySelectorAll('button')].find(
      (candidate) =>
        candidate.textContent?.replace(/\s/gu, '') === expectedText &&
        !candidate.disabled &&
        candidate.getBoundingClientRect().width > 0,
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

async function closeDrawer(page) {
  await clickButtonByText(page, '取消')
  await waitForDrawerClosed(page)
}

async function waitForDrawerClosed(page) {
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('.ant-drawer-content-wrapper')].some((wrapper) => {
        const bounds = wrapper.getBoundingClientRect()
        return (
          bounds.width > 0 &&
          bounds.height > 0 &&
          bounds.left < window.innerWidth &&
          bounds.right > 0
        )
      }),
  )
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

async function waitForText(page, text) {
  await page.waitForFunction(
    (expectedText) => document.body.textContent?.includes(expectedText),
    {},
    text,
  )
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

async function waitForTotal(page, total) {
  await page.waitForFunction(
    (expectedTotal) =>
      document.querySelector('[data-e2e="paper-total-score"]')?.textContent?.trim() ===
      expectedTotal,
    {},
    total,
  )
}
