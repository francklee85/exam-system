import puppeteer from 'puppeteer-core'

const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://localhost'
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const credentials = {
  admin: {
    username: process.env.E2E_ADMIN_USERNAME ?? process.env.E2E_USERNAME,
    password: process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_PASSWORD,
  },
  teacher: {
    username: process.env.E2E_TEACHER_USERNAME,
    password: process.env.E2E_TEACHER_PASSWORD,
  },
  student: {
    username: process.env.E2E_STUDENT_USERNAME,
    password: process.env.E2E_STUDENT_PASSWORD,
  },
}

for (const [role, account] of Object.entries(credentials)) {
  if (!account.username || !account.password) {
    throw new Error(`Dashboard E2E requires ${role} credentials`)
  }
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const results = {
  adminDashboard: false,
  teacherDashboard: false,
  studentDashboard: false,
  legacyCopyRemoved: false,
  adminQuickActions: 0,
  teacherQuickActions: 0,
  studentQuickActions: 0,
  recentExamLinks: 0,
}

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 1000 })
  page.setDefaultTimeout(30_000)

  await login(page, credentials.admin)
  await waitForText(page, '全局概览')
  await waitForText(page, '用户总数')
  await waitForText(page, '最近考试')
  await assertAbsent(page, ['DASHBOARD', '规划中', '功能入口将随业务模块逐步开放'])
  results.adminDashboard = true
  results.legacyCopyRemoved = true
  for (const [label, path, pageText] of [
    ['用户管理', '/users', '用户管理'],
    ['教师管理', '/teachers', '教师管理'],
    ['学生管理', '/students', '学生管理'],
    ['专业管理', '/majors', '专业管理'],
    ['班级管理', '/classes', '班级管理'],
    ['题库管理', '/questions', '题库管理'],
    ['试卷管理', '/papers', '试卷管理'],
    ['考试管理', '/exams', '考试管理'],
  ]) {
    await clickButtonAndVerify(page, label, path, pageText)
    results.adminQuickActions += 1
  }
  await clickFirstExamAndVerify(page, '/exams/')
  results.recentExamLinks += 1

  await login(page, credentials.teacher)
  await waitForText(page, '教学工作概览')
  await waitForText(page, '我的题目')
  await waitForText(page, '待阅卷任务')
  results.teacherDashboard = true
  for (const [label, path, pageText] of [
    ['新增题目', '/questions', '题库管理'],
    ['Markdown 批量导题', '/questions', '题库管理'],
    ['题库管理', '/questions', '题库管理'],
    ['创建试卷', '/papers', '试卷管理'],
    ['创建考试', '/exams', '考试管理'],
    ['阅卷管理', '/results', '阅卷管理'],
    ['成绩管理', '/exams', '考试管理'],
  ]) {
    await clickButtonAndVerify(page, label, path, pageText)
    results.teacherQuickActions += 1
  }
  await clickFirstExamAndVerify(page, '/exams/')
  results.recentExamLinks += 1

  await login(page, credentials.student)
  await waitForText(page, '学习概览')
  await waitForText(page, '云计算')
  await waitForText(page, '云计算2501班')
  await waitForText(page, '近期考试')
  await waitForText(page, '最近成绩')
  results.studentDashboard = true
  for (const [label, path, pageText] of [
    ['我的考试', '/my-exams', '我的考试'],
    ['我的成绩', '/my-results', '我的成绩'],
  ]) {
    await clickButtonAndVerify(page, label, path, pageText)
    results.studentQuickActions += 1
  }
  await clickFirstExamAndVerify(page, '/my-exams/')
  results.recentExamLinks += 1

  console.log(JSON.stringify(results, null, 2))
} finally {
  await browser.close()
}

async function login(page, account) {
  if (page.url().startsWith(frontendUrl)) {
    await page.evaluate(() => localStorage.clear())
  }
  await page.goto(`${frontendUrl}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#username')
  await clearAndType(page, '#username', account.username)
  await clearAndType(page, '#password', account.password)
  await Promise.all([
    page.waitForFunction(() => window.location.pathname === '/dashboard'),
    page.click('button[type="submit"]'),
  ])
  await waitForText(page, '欢迎回来')
}

async function clearAndType(page, selector, value) {
  await page.click(selector, { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type(selector, value)
}

async function waitForText(page, text) {
  await page.waitForFunction(
    (expected) => document.body.innerText.includes(expected),
    {},
    text,
  )
}

async function assertAbsent(page, texts) {
  const bodyText = await page.evaluate(() => document.body.innerText)
  for (const text of texts) {
    if (bodyText.includes(text)) {
      throw new Error(`Legacy Dashboard copy is still visible: ${text}`)
    }
  }
}

async function clickButtonAndVerify(page, label, path, pageText) {
  const clicked = await page.evaluate((text) => {
    const button = [...document.querySelectorAll('button')].find(
      (candidate) => candidate.textContent?.replaceAll(/\s/g, '') === text.replaceAll(/\s/g, ''),
    )
    button?.click()
    return button !== undefined
  }, label)
  if (!clicked) throw new Error(`Quick action not found: ${label}`)
  await page.waitForFunction((expected) => window.location.pathname === expected, {}, path)
  await waitForText(page, pageText)
  await page.goto(`${frontendUrl}/dashboard`, { waitUntil: 'domcontentloaded' })
  await waitForText(page, '欢迎回来')
}

async function clickFirstExamAndVerify(page, pathPrefix) {
  const clicked = await page.evaluate(() => {
    const link = document.querySelector('.dashboard-panel a')
    link?.click()
    return link !== null
  })
  if (!clicked) throw new Error('Recent exam link not found')
  await page.waitForFunction(
    (prefix) => window.location.pathname.startsWith(prefix),
    {},
    pathPrefix,
  )
  const openedErrorPage = await page.evaluate(
    () => document.body.innerText.includes('403') || document.body.innerText.includes('404'),
  )
  if (openedErrorPage) {
    throw new Error(`Recent exam opened an error page: ${page.url()}`)
  }
  await page.goto(`${frontendUrl}/dashboard`, { waitUntil: 'domcontentloaded' })
  await waitForText(page, '欢迎回来')
}
