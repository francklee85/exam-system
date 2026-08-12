import puppeteer from 'puppeteer-core'

const username = process.env.E2E_USERNAME
const password = process.env.E2E_PASSWORD
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://localhost:5173'
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const screenshotPrefix = process.env.E2E_SCREENSHOT_PREFIX

if (!username || !password) {
  throw new Error('E2E_USERNAME and E2E_PASSWORD are required')
}

const suffix = Date.now().toString().slice(-8)
const majorCreateName = `网络安全联调${suffix}`
const majorEditedName = `${majorCreateName}已编辑`
const majorCode = `SEC${suffix}`
const classCreateName = `云计算${suffix}班`
const classEditedName = `${classCreateName}已编辑`
const classCode = `CLOUD-E2E-${suffix}`

console.log(
  JSON.stringify({
    stage: 'planned-test-data',
    majorName: majorCreateName,
    majorCode,
    className: classCreateName,
    classCode,
  }),
)

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const results = {
  login: false,
  seedMajors: false,
  majorCreate: false,
  majorSearch: false,
  majorEdit: false,
  majorDisable: false,
  classCreate: false,
  classSearch: false,
  classMajorFilter: false,
  classEdit: false,
  classDisable: false,
  backendConsistent: false,
}

let createdMajor
let createdClass
let page

try {
  page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  page.setDefaultTimeout(15_000)

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

  await page.goto(`${frontendUrl}/majors`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.textContent?.includes('专业管理'))
  await Promise.all(
    ['云计算', 'AI数媒', 'AIGC', '网络运维'].map((name) =>
      waitForTableText(page, name),
    ),
  )
  results.seedMajors = true

  await page.click('[data-e2e="create-major"]')
  await page.waitForSelector('.ant-modal #name')
  await page.type('.ant-modal #name', majorCreateName)
  await page.type('.ant-modal #code', majorCode.toLowerCase())
  await page.type('.ant-modal #description', '浏览器联调创建的临时专业')
  const majorCreateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/majors') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  )
  await clickButtonByText(page, '创建')
  createdMajor = await (await majorCreateResponse).json()
  results.majorCreate = createdMajor.code === majorCode
  await waitForModalClosed(page)

  await clearAndType(page, '[data-e2e="major-keyword"]', majorCode)
  const majorSearchResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/majors?') &&
      response.url().includes(`keyword=${majorCode}`) &&
      response.status() === 200,
  )
  await clickButtonByText(page, '查询')
  await majorSearchResponse
  await waitForTableText(page, majorCode)
  results.majorSearch = true

  await page.click(`[data-e2e="edit-major-${createdMajor.id}"]`)
  await clearAndType(page, '.ant-modal #name', majorEditedName)
  await clearAndType(page, '.ant-modal #description', '浏览器联调已完成编辑')
  const majorEditResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/majors/${createdMajor.id}`) &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '保存')
  const editedMajor = await (await majorEditResponse).json()
  results.majorEdit = editedMajor.name === majorEditedName
  await waitForModalClosed(page)

  await page.click(`[data-e2e="status-major-${createdMajor.id}"]`)
  const majorStatusResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/majors/${createdMajor.id}/status`) &&
      response.request().method() === 'PATCH' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '确认')
  const disabledMajor = await (await majorStatusResponse).json()
  await waitForRowStatus(page, majorCode, '禁用')
  results.majorDisable = disabledMajor.status === 'disabled'

  if (screenshotPrefix) {
    await page.screenshot({ path: `${screenshotPrefix}-majors.png`, fullPage: true })
  }

  await page.goto(`${frontendUrl}/classes`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.textContent?.includes('班级管理'))
  await page.click('[data-e2e="create-class"]')
  await page.waitForSelector('[data-e2e="class-major-select"]')
  await selectOption(page, '[data-e2e="class-major-select"]', '云计算 / CLOUD')
  await page.type('.ant-modal #name', classCreateName)
  await page.type('.ant-modal #code', classCode.toLowerCase())
  await page.type('.ant-modal #enrollment_year', '2025')
  await page.type('.ant-modal #description', '浏览器联调创建的临时班级')
  const classCreateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/classes') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  )
  await clickButtonByText(page, '创建')
  createdClass = await (await classCreateResponse).json()
  results.classCreate =
    createdClass.code === classCode &&
    createdClass.enrollment_year === 2025 &&
    createdClass.major.name === '云计算'
  await waitForModalClosed(page)

  await clearAndType(page, '[data-e2e="class-keyword"]', classCode)
  const classSearchResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/classes?') &&
      response.url().includes(`keyword=${classCode}`) &&
      response.status() === 200,
  )
  await clickButtonByText(page, '查询')
  await classSearchResponse
  await waitForTableText(page, classCode)
  results.classSearch = true

  await selectOption(page, '[data-e2e="class-major-filter"]', '云计算 / CLOUD')
  const majorFilterResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/classes?') &&
      response.url().includes('major_id=') &&
      response.status() === 200,
  )
  await clickButtonByText(page, '查询')
  await majorFilterResponse
  await waitForTableText(page, classCode)
  results.classMajorFilter = true

  await page.click(`[data-e2e="edit-class-${createdClass.id}"]`)
  await clearAndType(page, '.ant-modal #name', classEditedName)
  await clearAndType(page, '.ant-modal #description', '浏览器联调已完成编辑')
  const classEditResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/classes/${createdClass.id}`) &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '保存')
  const editedClass = await (await classEditResponse).json()
  results.classEdit = editedClass.name === classEditedName
  await waitForModalClosed(page)

  await page.click(`[data-e2e="status-class-${createdClass.id}"]`)
  const classStatusResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/classes/${createdClass.id}/status`) &&
      response.request().method() === 'PATCH' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '确认')
  const disabledClass = await (await classStatusResponse).json()
  await waitForRowStatus(page, classCode, '禁用')
  results.classDisable = disabledClass.status === 'disabled'

  const backendRecords = await page.evaluate(
    async ({ majorId, classId }) => {
      const token = window.localStorage.getItem('exam-system.access-token')
      const headers = { Authorization: `Bearer ${token}` }
      const [majorResponse, classResponse] = await Promise.all([
        fetch(`/api/v1/majors/${majorId}`, { headers }),
        fetch(`/api/v1/classes/${classId}`, { headers }),
      ])
      return {
        major: await majorResponse.json(),
        classInfo: await classResponse.json(),
      }
    },
    { majorId: createdMajor.id, classId: createdClass.id },
  )
  results.backendConsistent =
    backendRecords.major.name === majorEditedName &&
    backendRecords.major.status === 'disabled' &&
    backendRecords.classInfo.name === classEditedName &&
    backendRecords.classInfo.status === 'disabled' &&
    backendRecords.classInfo.major.name === '云计算'

  if (screenshotPrefix) {
    await page.screenshot({ path: `${screenshotPrefix}-classes.png`, fullPage: true })
  }

  const failedChecks = Object.entries(results)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)

  console.log(
    JSON.stringify(
      {
        results,
        retainedDisabledTestData: {
          major: { id: createdMajor.id, name: majorEditedName, code: majorCode },
          classInfo: { id: createdClass.id, name: classEditedName, code: classCode },
        },
      },
      null,
      2,
    ),
  )
  if (failedChecks.length > 0) {
    throw new Error(`Organization browser smoke checks failed: ${failedChecks.join(', ')}`)
  }
} catch (error) {
  if (page !== undefined) {
    await disableRetainedTestData(page, createdClass, createdMajor)
    if (screenshotPrefix) {
      await page.screenshot({ path: `${screenshotPrefix}-failure.png`, fullPage: true })
    }
  }
  throw error
} finally {
  await browser.close()
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

async function waitForModalClosed(page) {
  await page.waitForSelector('.ant-modal-wrap', { hidden: true })
}

async function disableRetainedTestData(page, classInfo, major) {
  await page.evaluate(
    async ({ classId, majorId }) => {
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
        await fetch(`/api/v1/${resource}/${id}/status`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ status: 'disabled' }),
        })
      }

      await disable('classes', classId)
      await disable('majors', majorId)
    },
    { classId: classInfo?.id, majorId: major?.id },
  )
}

async function selectOption(page, selector, label) {
  await page.click(selector)
  await page.waitForFunction(
    (expectedLabel) =>
      [...document.querySelectorAll('.ant-select-item-option-content')].some(
        (option) => option.textContent?.trim() === expectedLabel,
      ),
    {},
    label,
  )
  await page.evaluate((expectedLabel) => {
    const option = [...document.querySelectorAll('.ant-select-item-option-content')].find(
      (candidate) => candidate.textContent?.trim() === expectedLabel,
    )
    option?.parentElement?.click()
  }, label)
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

async function waitForRowStatus(page, rowText, statusText) {
  await page.waitForFunction(
    (expectedRowText, expectedStatusText) =>
      [...document.querySelectorAll('tbody tr')].some(
        (row) =>
          row.textContent?.includes(expectedRowText) &&
          row.textContent?.includes(expectedStatusText),
      ),
    {},
    rowText,
    statusText,
  )
}
