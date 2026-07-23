import puppeteer from 'puppeteer-core'

const username = process.env.E2E_USERNAME
const password = process.env.E2E_PASSWORD
const frontendUrl = process.env.E2E_FRONTEND_URL ?? 'http://localhost:5173'
const chromePath = process.env.CHROME_PATH ?? '/usr/bin/google-chrome'
const screenshotPath = process.env.E2E_SCREENSHOT_PATH

if (!username || !password) {
  throw new Error('E2E_USERNAME and E2E_PASSWORD are required')
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const results = {
  protectedRedirect: false,
  wrongPasswordMessage: false,
  login: false,
  bearerToken: false,
  dashboard: false,
  refreshRestore: false,
  forbidden: false,
  notFound: false,
  logout: false,
  protectedAfterLogout: false,
}

try {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  page.setDefaultTimeout(10_000)

  let currentUserRequestCount = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/auth/me')) {
      currentUserRequestCount += 1
      const authorization = request.headers().authorization
      if (authorization?.startsWith('Bearer ')) {
        results.bearerToken = true
      }
    }
  })

  await page.goto(`${frontendUrl}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.location.pathname === '/login')
  results.protectedRedirect = new URL(page.url()).pathname === '/login'

  await page.type('#username', username)
  await page.type('#password', `${password}-wrong`)
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => document.body.textContent?.includes('用户名或密码错误'))
  results.wrongPasswordMessage = new URL(page.url()).pathname === '/login'

  await page.click('#password', { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type('#password', password)

  const loginResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/auth/login') && response.status() === 200,
  )
  const currentUserResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/v1/auth/me') && response.status() === 200,
  )
  await page.click('button[type="submit"]')
  await Promise.all([loginResponse, currentUserResponse])
  await page.waitForFunction(() => window.location.pathname === '/dashboard')

  results.login = true
  results.dashboard = await page.evaluate(
    () =>
      document.body.textContent?.includes('欢迎，系统管理员') === true &&
      document.body.textContent?.includes('用户管理') === true,
  )
  if (screenshotPath) {
    await page.screenshot({ path: screenshotPath, fullPage: true })
  }

  const requestCountBeforeRefresh = currentUserRequestCount
  const restoreResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/v1/auth/me') && response.status() === 200,
  )
  await page.reload({ waitUntil: 'domcontentloaded' })
  await restoreResponse
  await page.waitForFunction(() => window.location.pathname === '/dashboard')
  results.refreshRestore = currentUserRequestCount > requestCountBeforeRefresh

  await page.goto(`${frontendUrl}/questions`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.location.pathname === '/403')
  results.forbidden = documentPath(page.url()) === '/403'

  await page.goto(`${frontendUrl}/route-that-does-not-exist`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.textContent?.includes('页面不存在'))
  results.notFound = await page.evaluate(
    () => document.body.textContent?.includes('页面不存在') === true,
  )

  await page.goto(`${frontendUrl}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => document.body.textContent?.includes('退出登录'))
  await page.evaluate(() => {
    const logoutButton = [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('退出登录'),
    )
    logoutButton?.click()
  })
  await page.waitForFunction(() => window.location.pathname === '/login')
  results.logout = await page.evaluate(
    () => window.localStorage.getItem('exam-system.access-token') === null,
  )

  await page.goto(`${frontendUrl}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.location.pathname === '/login')
  results.protectedAfterLogout = documentPath(page.url()) === '/login'

  const failedChecks = Object.entries(results)
    .filter(([, passed]) => !passed)
    .map(([name]) => name)

  console.log(JSON.stringify(results, null, 2))
  if (failedChecks.length > 0) {
    throw new Error(`Browser smoke checks failed: ${failedChecks.join(', ')}`)
  }
} finally {
  await browser.close()
}

function documentPath(url) {
  return new URL(url).pathname
}
