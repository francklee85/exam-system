import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  username: `markdown_teacher_${suffix}`,
  password: 'Markdown-Teacher-2026!',
  realName: 'Markdown 联调教师',
}
const marker = `MD-IMPORT-${suffix}`
const markdown = `# Markdown 浏览器联调题库

## 题目
类型：单选题
难度：简单
### 题干
Linux 查看当前目录命令？ ${marker}

\`\`\`bash
pwd
\`\`\`

### 选项
- a. cd
- b. pwd
### 正确答案
b
### 解析
\`pwd\` 显示当前目录。

## 题目
类型：多选题
难度：中等
### 题干
Linux 文件系统 ${marker}
### 选项
- A. ext4
- B. XFS
- C. NTFS
- D. Btrfs
### 正确答案
d, a, b

## 题目
类型：判断题
难度：简单
### 题干
Kubernetes 是容器编排系统。 ${marker}
### 正确答案
正确

## 题目
类型：填空题
难度：简单
### 题干
Linux 默认超级用户是 ______。 ${marker}
### 参考答案
root

## 题目
类型：主观问答题
难度：困难
### 题干
简述容器与虚拟机区别。 ${marker}
### 参考答案
容器共享宿主机内核。
虚拟机运行完整 Guest OS。

## 题目
类型：填空题
难度：普通
### 题干
该非法题目不能导入。 ${marker}
### 正确答案
root
`

const results = {
  teacherLogin: false,
  pastedPreview: false,
  mdUpload: false,
  validAndInvalidPreview: false,
  importStats: false,
  fiveTypesImported: false,
  invalidSkipped: false,
  backendConsistent: false,
  adminSeesImportedQuestions: false,
}

const tempDirectory = await mkdtemp(join(tmpdir(), 'exam-markdown-import-'))
const markdownPath = join(tempDirectory, 'questions.md')
await writeFile(markdownPath, markdown, 'utf8')

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

let page
let teacherId
let importedIds = []
let currentStage = 'start'

try {
  page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1000 })
  page.setDefaultTimeout(25_000)

  currentStage = 'admin-login'
  await login(page, adminUsername, adminPassword)
  teacherId = await page.evaluate(
    async ({ apiBaseUrl, teacherData }) => {
      const token = window.localStorage.getItem('exam-system.access-token')
      const response = await fetch(`${apiBaseUrl}/api/v1/teachers`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: teacherData.username,
          password: teacherData.password,
          real_name: teacherData.realName,
        }),
      })
      const body = await response.json()
      if (!response.ok) {
        throw new Error(`create teacher: ${response.status} ${JSON.stringify(body)}`)
      }
      return body.id
    },
    { apiBaseUrl: apiUrl, teacherData: teacher },
  )

  currentStage = 'teacher-login'
  await login(page, teacher.username, teacher.password)
  results.teacherLogin = true
  await page.goto(`${frontendUrl}/questions`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.textContent?.includes('题库管理'))

  currentStage = 'open-import'
  await page.click('[data-e2e="import-question-markdown"]')
  await page.waitForSelector('[data-e2e="question-markdown-input"]', {
    visible: true,
  })

  currentStage = 'paste-preview'
  await setTextArea(page, '[data-e2e="question-markdown-input"]', markdown)
  const pastePreviewResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/questions/import/preview') &&
      response.request().method() === 'POST',
  )
  await clickButtonByText(page, '解析预览')
  const pastedPreview = await (await pastePreviewResponse).json()
  results.pastedPreview =
    pastedPreview.total_count === 6 &&
    pastedPreview.valid_count === 5 &&
    pastedPreview.invalid_count === 1

  currentStage = 'upload-file'
  const fileInput = await page.$('input[type="file"]')
  if (!fileInput) {
    throw new Error('Markdown file input not found')
  }
  await fileInput.uploadFile(markdownPath)
  await page.waitForFunction(
    (expected) => {
      const textarea = document.querySelector(
        '[data-e2e="question-markdown-input"]',
      )
      return textarea instanceof HTMLTextAreaElement && textarea.value === expected
    },
    {},
    markdown,
  )
  results.mdUpload = true

  currentStage = 'upload-preview'
  const uploadPreviewResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/questions/import/preview') &&
      response.request().method() === 'POST',
  )
  await clickButtonByText(page, '解析预览')
  const uploadPreview = await (await uploadPreviewResponse).json()
  await page.waitForFunction(
    () =>
      document.body.textContent?.includes('不支持难度“普通”') &&
      document.body.textContent?.includes('主观问答题'),
  )
  results.validAndInvalidPreview =
    uploadPreview.valid_count === 5 &&
    uploadPreview.invalid_count === 1 &&
    uploadPreview.items[0].payload.content.includes('```bash') &&
    uploadPreview.items[1].payload.correct_answer.join(',') === 'A,B,D'

  currentStage = 'confirm-import'
  const importResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/questions/import') &&
      response.request().method() === 'POST',
  )
  await clickButtonByText(page, '确认导入合法题目')
  const importResponse = await importResponsePromise
  const importResult = await importResponse.json()
  importedIds = importResult.items
    .filter((item) => item.status === 'imported')
    .map((item) => item.question_id)
  await page.waitForFunction(() =>
    document.body.textContent?.includes('成功导入 5 道题'),
  )
  results.importStats =
    importResponse.status() === 201 &&
    importResult.imported_count === 5 &&
    importResult.skipped_count === 1

  currentStage = 'verify-teacher-api'
  const verification = await page.evaluate(
    async ({ apiBaseUrl, keyword }) => {
      const token = window.localStorage.getItem('exam-system.access-token')
      const response = await fetch(
        `${apiBaseUrl}/api/v1/questions?page=1&page_size=100&keyword=${encodeURIComponent(keyword)}`,
        { headers: { Authorization: `Bearer ${token}` } },
      )
      const body = await response.json()
      if (!response.ok) {
        throw new Error(`list questions: ${response.status} ${JSON.stringify(body)}`)
      }
      return body
    },
    { apiBaseUrl: apiUrl, keyword: marker },
  )
  const importedTypes = new Set(
    verification.items
      .filter((item) => importedIds.includes(item.id))
      .map((item) => item.question_type),
  )
  results.fiveTypesImported =
    importedTypes.size === 5 &&
    ['single_choice', 'multiple_choice', 'true_false', 'fill_blank', 'subjective'].every(
      (type) => importedTypes.has(type),
    )
  results.invalidSkipped = !verification.items.some((item) =>
    item.content.includes('该非法题目不能导入'),
  )
  results.backendConsistent =
    verification.items.filter((item) => importedIds.includes(item.id)).length === 5

  currentStage = 'admin-view'
  await login(page, adminUsername, adminPassword)
  await page.goto(`${frontendUrl}/questions`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.textContent?.includes('题库管理'))
  await setTextArea(page, '[data-e2e="question-keyword"]', marker)
  const listResponse = page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/questions?') &&
      response.url().includes(encodeURIComponent(marker)),
  )
  await clickButtonByText(page, '查询')
  await listResponse
  await page.waitForFunction(
    (expected) => document.body.textContent?.includes(expected),
    {},
    marker,
  )
  results.adminSeesImportedQuestions = true

  if (screenshotPrefix) {
    await page.screenshot({
      path: `${screenshotPrefix}-markdown-import.png`,
      fullPage: true,
    })
  }
} catch (error) {
  console.error(
    `Markdown import browser smoke failed at ${currentStage}:`,
    error,
  )
  if (page && screenshotPrefix) {
    await page.screenshot({
      path: `${screenshotPrefix}-markdown-import-failed.png`,
      fullPage: true,
    })
  }
  throw new Error(
    `Markdown import browser smoke failed at ${currentStage}: ${
      error instanceof Error ? error.stack : String(error)
    }`,
  )
} finally {
  if (page) {
    try {
      await login(page, adminUsername, adminPassword)
      await page.evaluate(
        async ({ apiBaseUrl, questionIds, createdTeacherId }) => {
          const token = window.localStorage.getItem('exam-system.access-token')
          const headers = {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          }
          await Promise.all(
            questionIds.map((questionId) =>
              fetch(`${apiBaseUrl}/api/v1/questions/${questionId}/status`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ status: 'disabled' }),
              }),
            ),
          )
          if (createdTeacherId) {
            await fetch(`${apiBaseUrl}/api/v1/teachers/${createdTeacherId}/status`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify({ status: 'disabled' }),
            })
          }
        },
        {
          apiBaseUrl: apiUrl,
          questionIds: importedIds,
          createdTeacherId: teacherId,
        },
      )
    } catch {
      // Keep the primary test error if best-effort cleanup fails.
    }
  }
  await browser.close()
  await rm(tempDirectory, { recursive: true, force: true })
}

console.log(JSON.stringify({ suffix, marker, results }, null, 2))
if (Object.values(results).some((value) => value !== true)) {
  throw new Error(`Incomplete Markdown import browser verification: ${JSON.stringify(results)}`)
}

async function login(targetPage, username, password) {
  await targetPage.goto(`${frontendUrl}/login`, { waitUntil: 'domcontentloaded' })
  await targetPage.evaluate(() => window.localStorage.clear())
  await targetPage.reload({ waitUntil: 'domcontentloaded' })
  await targetPage.waitForSelector('#username')
  await targetPage.type('#username', username)
  await targetPage.type('#password', password)
  await Promise.all([
    targetPage.waitForResponse(
      (response) =>
        response.url().endsWith('/api/v1/auth/login') &&
        response.request().method() === 'POST',
    ),
    clickButtonByText(targetPage, '登录'),
  ])
  await targetPage.waitForFunction(() =>
    window.localStorage.getItem('exam-system.access-token'),
  )
}

async function setTextArea(targetPage, selector, value) {
  await targetPage.waitForSelector(selector, { visible: true })
  await targetPage.evaluate(
    ({ elementSelector, text }) => {
      const element = document.querySelector(elementSelector)
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
        throw new Error(`Input not found: ${elementSelector}`)
      }
      const prototype =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set
      setter?.call(element, text)
      element.dispatchEvent(new Event('input', { bubbles: true }))
      element.dispatchEvent(new Event('change', { bubbles: true }))
    },
    { elementSelector: selector, text: value },
  )
}

async function clickButtonByText(targetPage, text) {
  const clicked = await targetPage.evaluate((buttonText) => {
    const buttons = [...document.querySelectorAll('button')]
    const button = buttons.find(
      (item) =>
        item.offsetParent !== null &&
        item.textContent?.replace(/\s+/gu, '') === buttonText.replace(/\s+/gu, ''),
    )
    if (!(button instanceof HTMLButtonElement)) {
      return false
    }
    button.click()
    return true
  }, text)
  if (!clicked) {
    throw new Error(`Visible button not found: ${text}`)
  }
}
