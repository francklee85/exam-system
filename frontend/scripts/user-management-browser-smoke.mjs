import puppeteer from 'puppeteer-core'

const username = process.env.E2E_USERNAME
const password = process.env.E2E_PASSWORD
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://localhost:5173'
const apiUrl = process.env.E2E_API_URL ?? 'http://localhost:8000'
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const screenshotPrefix = process.env.E2E_SCREENSHOT_PREFIX
const accountSuffix = process.env.E2E_ACCOUNT_SUFFIX ?? ''

if (!username || !password) {
  throw new Error('E2E_USERNAME and E2E_PASSWORD are required')
}

const testData = {
  teacherUsername: `teacher001_test${accountSuffix}`,
  teacherName: '测试教师',
  teacherEditedName: '测试教师已编辑',
  teacherPassword: 'Teacher-Test-2026!',
  studentNo: `20260001_test${accountSuffix}`,
  studentUsername: `20260001_test${accountSuffix}`,
  studentName: '张三测试',
  studentEditedName: '张三测试已转班',
  studentPassword: 'Student-Test-2026!',
}

const requiredClasses = [
  {
    majorLabel: '云计算 / CLOUD',
    name: '云计算2501班',
    code: 'CLOUD-2501',
    year: '2025',
  },
  {
    majorLabel: 'AIGC / AIGC',
    name: 'AIGC2501班',
    code: 'AIGC-2501',
    year: '2025',
  },
]

console.log(JSON.stringify({ stage: 'planned-test-data', ...testData }))

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const results = {
  login: false,
  cloudClassReady: false,
  aigcClassReady: false,
  teacherCreate: false,
  teacherEdit: false,
  teacherDisable: false,
  teacherLoginRejected: false,
  studentCreate: false,
  studentMajorFilter: false,
  studentClassFilter: false,
  studentMoveClass: false,
  studentDisable: false,
  studentLoginRejected: false,
  usersIncludeAllRoles: false,
  userTeacherFilter: false,
  userStudentFilter: false,
  backendConsistent: false,
}

let page
let createdTeacher
let createdStudent

try {
  page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 960 })
  page.setDefaultTimeout(20_000)

  await page.goto(`${frontendUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#username')
  await page.type('#username', username)
  await page.type('#password', password)
  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/login') && response.status() === 200,
  )
  await clickButtonByText(page, '登录')
  await loginResponse
  await page.waitForFunction(() => window.location.pathname === '/dashboard')
  results.login = true

  await page.goto(`${frontendUrl}/classes`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.textContent?.includes('班级管理'))
  const cloudClass = await ensureActiveClass(page, requiredClasses[0])
  results.cloudClassReady = cloudClass.status === 'active'
  const aigcClass = await ensureActiveClass(page, requiredClasses[1])
  results.aigcClassReady = aigcClass.status === 'active'

  await page.goto(`${frontendUrl}/teachers`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.textContent?.includes('教师管理'))
  await page.click('[data-e2e="create-teacher"]')
  await page.waitForSelector('[data-e2e="teacher-username"]', { visible: true })
  await page.type('[data-e2e="teacher-username"]', testData.teacherUsername)
  await page.type('[data-e2e="teacher-real-name"]', testData.teacherName)
  await page.type('[data-e2e="teacher-password"]', testData.teacherPassword)
  await page.type('[data-e2e="teacher-confirm-password"]', testData.teacherPassword)
  const teacherCreateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/teachers') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  )
  await clickButtonByText(page, '创建')
  createdTeacher = await (await teacherCreateResponse).json()
  await waitForModalClosed(page)
  results.teacherCreate =
    createdTeacher.username === testData.teacherUsername &&
    createdTeacher.roles.includes('teacher')

  await clearAndType(page, '[data-e2e="teacher-keyword"]', testData.teacherUsername)
  const teacherSearchResponse = waitForApiResponse(page, '/api/v1/teachers?', 'GET')
  await clickButtonByText(page, '查询')
  await teacherSearchResponse
  await waitForTableText(page, testData.teacherUsername)

  await page.click(`[data-e2e="edit-teacher-${createdTeacher.id}"]`)
  await clearAndType(page, '[data-e2e="teacher-real-name"]', testData.teacherEditedName)
  const teacherEditResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/teachers/${createdTeacher.id}`) &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '保存')
  const editedTeacher = await (await teacherEditResponse).json()
  await waitForModalClosed(page)
  results.teacherEdit = editedTeacher.real_name === testData.teacherEditedName

  await page.click(`[data-e2e="status-teacher-${createdTeacher.id}"]`)
  const teacherStatusResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/teachers/${createdTeacher.id}/status`) &&
      response.request().method() === 'PATCH' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '确认')
  const disabledTeacher = await (await teacherStatusResponse).json()
  results.teacherDisable = disabledTeacher.status === 'disabled'
  results.teacherLoginRejected =
    (await loginStatus(page, testData.teacherUsername, testData.teacherPassword)) === 401

  if (screenshotPrefix) {
    await page.screenshot({ path: `${screenshotPrefix}-teachers.png`, fullPage: true })
  }

  await page.goto(`${frontendUrl}/students`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.textContent?.includes('学生管理'))
  await page.click('[data-e2e="create-student"]')
  await page.waitForSelector('[data-e2e="student-no"]', { visible: true })
  await page.type('[data-e2e="student-no"]', testData.studentNo)
  await page.type('[data-e2e="student-username"]', testData.studentUsername)
  await page.type('[data-e2e="student-real-name"]', testData.studentName)
  await page.type('[data-e2e="student-password"]', testData.studentPassword)
  await page.type('[data-e2e="student-confirm-password"]', testData.studentPassword)
  const cloudClassOptionsResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/classes?') &&
      response.url().includes(`major_id=${cloudClass.major.id}`) &&
      response.url().includes('status=active') &&
      response.status() === 200,
  )
  await selectOption(page, '[data-e2e="student-major-select"]', '云计算 / CLOUD')
  await cloudClassOptionsResponse
  await selectOption(
    page,
    '[data-e2e="student-class-select"]',
    '云计算2501班 / CLOUD-2501',
  )
  const studentCreateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/students') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  )
  await clickButtonByText(page, '创建')
  createdStudent = await (await studentCreateResponse).json()
  await waitForModalClosed(page)
  results.studentCreate =
    createdStudent.student_no === testData.studentNo &&
    createdStudent.class.id === cloudClass.id &&
    createdStudent.major.code === 'CLOUD'

  await clearAndType(page, '[data-e2e="student-keyword"]', testData.studentUsername)
  await selectOption(page, '[data-e2e="student-major-filter"]', '云计算 / CLOUD')
  const studentMajorFilterResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/students?') &&
      response.url().includes(`major_id=${cloudClass.major.id}`) &&
      response.status() === 200,
  )
  await clickButtonByText(page, '查询')
  await studentMajorFilterResponse
  await waitForTableText(page, testData.studentUsername)
  results.studentMajorFilter = true

  await selectOption(
    page,
    '[data-e2e="student-class-filter"]',
    '云计算2501班 / CLOUD-2501',
  )
  const studentClassFilterResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/students?') &&
      response.url().includes(`class_id=${cloudClass.id}`) &&
      response.status() === 200,
  )
  await clickButtonByText(page, '查询')
  await studentClassFilterResponse
  await waitForTableText(page, testData.studentUsername)
  results.studentClassFilter = true

  await page.click(`[data-e2e="edit-student-${createdStudent.id}"]`)
  await clearAndType(page, '[data-e2e="student-real-name"]', testData.studentEditedName)
  const aigcClassOptionsResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/classes?') &&
      response.url().includes(`major_id=${aigcClass.major.id}`) &&
      response.url().includes('status=active') &&
      response.status() === 200,
  )
  await selectOption(page, '[data-e2e="student-major-select"]', 'AIGC / AIGC')
  await aigcClassOptionsResponse
  await selectOption(page, '[data-e2e="student-class-select"]', 'AIGC2501班 / AIGC-2501')
  const studentEditResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/students/${createdStudent.id}`) &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '保存')
  const movedStudent = await (await studentEditResponse).json()
  await waitForModalClosed(page)
  results.studentMoveClass =
    movedStudent.class.id === aigcClass.id &&
    movedStudent.major.code === 'AIGC' &&
    movedStudent.real_name === testData.studentEditedName

  const resetResponse = waitForApiResponse(page, '/api/v1/students?', 'GET')
  await clickButtonByText(page, '重置')
  await resetResponse
  await clearAndType(page, '[data-e2e="student-keyword"]', testData.studentUsername)
  const movedSearchResponse = waitForApiResponse(page, '/api/v1/students?', 'GET')
  await clickButtonByText(page, '查询')
  await movedSearchResponse
  await waitForTableText(page, testData.studentUsername)
  await waitForTableText(page, 'AIGC2501班')

  await page.click(`[data-e2e="status-student-${createdStudent.id}"]`)
  const studentStatusResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/students/${createdStudent.id}/status`) &&
      response.request().method() === 'PATCH' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '确认')
  const disabledStudent = await (await studentStatusResponse).json()
  results.studentDisable = disabledStudent.status === 'disabled'
  results.studentLoginRejected =
    (await loginStatus(page, testData.studentUsername, testData.studentPassword)) === 401

  if (screenshotPrefix) {
    await page.screenshot({ path: `${screenshotPrefix}-students.png`, fullPage: true })
  }

  await page.goto(`${frontendUrl}/users`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.textContent?.includes('用户管理'))
  await Promise.all([
    waitForTableText(page, username),
    waitForTableText(page, testData.teacherUsername),
    waitForTableText(page, testData.studentUsername),
  ])
  results.usersIncludeAllRoles = true

  await selectOption(page, '[data-e2e="user-role-filter"]', '教师')
  const teacherRoleResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/users?') &&
      response.url().includes('role=teacher') &&
      response.status() === 200,
  )
  await clickButtonByText(page, '查询')
  await teacherRoleResponse
  await waitForTableText(page, testData.teacherUsername)
  await waitForTableNotText(page, testData.studentUsername)
  results.userTeacherFilter = true

  const userResetResponse = waitForApiResponse(page, '/api/v1/users?', 'GET')
  await clickButtonByText(page, '重置')
  await userResetResponse
  await selectOption(page, '[data-e2e="user-role-filter"]', '学生')
  const studentRoleResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/users?') &&
      response.url().includes('role=student') &&
      response.status() === 200,
  )
  await clickButtonByText(page, '查询')
  await studentRoleResponse
  await waitForTableText(page, testData.studentUsername)
  await waitForTableNotText(page, testData.teacherUsername)
  results.userStudentFilter = true

  const backendRecords = await page.evaluate(
    async ({ apiBaseUrl, teacherId, studentId }) => {
      const token = window.localStorage.getItem('exam-system.access-token')
      const headers = { Authorization: `Bearer ${token}` }
      const [teacherResponse, studentResponse] = await Promise.all([
        fetch(`${apiBaseUrl}/api/v1/teachers/${teacherId}`, { headers }),
        fetch(`${apiBaseUrl}/api/v1/students/${studentId}`, { headers }),
      ])
      return {
        teacher: await teacherResponse.json(),
        student: await studentResponse.json(),
      }
    },
    {
      apiBaseUrl: apiUrl,
      teacherId: createdTeacher.id,
      studentId: createdStudent.id,
    },
  )
  results.backendConsistent =
    backendRecords.teacher.status === 'disabled' &&
    backendRecords.teacher.real_name === testData.teacherEditedName &&
    backendRecords.student.status === 'disabled' &&
    backendRecords.student.class.id === aigcClass.id &&
    backendRecords.student.major.code === 'AIGC'

  if (screenshotPrefix) {
    await page.screenshot({ path: `${screenshotPrefix}-users.png`, fullPage: true })
  }

  const failedChecks = Object.entries(results)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)

  console.log(
    JSON.stringify(
      {
        results,
        retainedFoundationClasses: [cloudClass, aigcClass].map(
          ({ id, name, code, status }) => ({ id, name, code, status }),
        ),
        retainedDisabledTestAccounts: {
          teacher: {
            id: createdTeacher.id,
            username: testData.teacherUsername,
          },
          student: {
            id: createdStudent.id,
            username: testData.studentUsername,
            studentNo: testData.studentNo,
          },
        },
      },
      null,
      2,
    ),
  )

  if (failedChecks.length > 0) {
    throw new Error(`User management browser checks failed: ${failedChecks.join(', ')}`)
  }
} catch (error) {
  if (page !== undefined) {
    await disableRetainedAccounts(page, createdStudent?.id, createdTeacher?.id, apiUrl)
    if (screenshotPrefix) {
      await page.screenshot({ path: `${screenshotPrefix}-failure.png`, fullPage: true })
    }
  }
  throw error
} finally {
  await browser.close()
}

async function ensureActiveClass(page, classData) {
  const existingClass = await page.evaluate(
    async ({ apiBaseUrl, code }) => {
      const token = window.localStorage.getItem('exam-system.access-token')
      const response = await fetch(
        `${apiBaseUrl}/api/v1/classes?page=1&page_size=100&keyword=${encodeURIComponent(code)}&status=active`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const data = await response.json()
      return data.items.find((item) => item.code === code) ?? null
    },
    { apiBaseUrl: apiUrl, code: classData.code },
  )
  if (existingClass !== null) {
    return existingClass
  }

  await page.click('[data-e2e="create-class"]')
  await page.waitForSelector('[data-e2e="class-major-select"]', { visible: true })
  await selectOption(page, '[data-e2e="class-major-select"]', classData.majorLabel)
  await page.type('.ant-modal #name', classData.name)
  await page.type('.ant-modal #code', classData.code)
  await page.type('.ant-modal #enrollment_year', classData.year)
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/classes') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  )
  await clickButtonByText(page, '创建')
  const createdClass = await (await createResponse).json()
  await waitForModalClosed(page)
  return createdClass
}

async function loginStatus(page, loginUsername, loginPassword) {
  return page.evaluate(
    async ({ apiBaseUrl, candidateUsername, candidatePassword }) => {
      const response = await fetch(`${apiBaseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: candidateUsername,
          password: candidatePassword,
        }),
      })
      return response.status
    },
    {
      apiBaseUrl: apiUrl,
      candidateUsername: loginUsername,
      candidatePassword: loginPassword,
    },
  )
}

async function disableRetainedAccounts(page, studentId, teacherId, apiBaseUrl) {
  await page.evaluate(
    async ({ apiRoot, currentStudentId, currentTeacherId }) => {
      const token = window.localStorage.getItem('exam-system.access-token')
      if (!token) {
        return
      }
      const headers = {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      }
      const disable = async (resource, id) => {
        if (id === undefined) {
          return
        }
        await fetch(`${apiRoot}/api/v1/${resource}/${id}/status`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: 'disabled' }),
        })
      }
      await disable('students', currentStudentId)
      await disable('teachers', currentTeacherId)
    },
    {
      apiRoot: apiBaseUrl,
      currentStudentId: studentId,
      currentTeacherId: teacherId,
    },
  )
}

function waitForApiResponse(page, pathFragment, method) {
  return page.waitForResponse(
    (response) =>
      response.url().includes(pathFragment) &&
      response.request().method() === method &&
      response.status() === 200,
  )
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

async function selectOption(page, selector, label) {
  await page.click(selector)
  await page.waitForFunction(
    (expectedLabel) =>
      [...document.querySelectorAll('.ant-select-item-option-content')].some(
        (option) => {
          const dropdown = option.closest('.ant-select-dropdown')
          const bounds = dropdown?.getBoundingClientRect()
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
        const dropdown = candidate.closest('.ant-select-dropdown')
        const bounds = dropdown?.getBoundingClientRect()
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

async function waitForModalClosed(page) {
  await page.waitForSelector('.ant-modal-wrap', { hidden: true })
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

async function waitForTableNotText(page, text) {
  await page.waitForFunction(
    (expectedText) =>
      ![...document.querySelectorAll('tbody tr')].some((row) =>
        row.textContent?.includes(expectedText),
      ),
    {},
    text,
  )
}
