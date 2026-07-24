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
  username: `exam_teacher_${suffix}`,
  password: 'Exam-Teacher-2026!',
  realName: '考试联调教师',
}
const student = {
  username: `exam_student_${suffix}`,
  studentNo: `ES${suffix}`,
  password: 'Exam-Student-2026!',
  realName: '考试联调学生',
}
const examName = `2026 云计算 Linux 阶段考试 [${suffix}]`
const paperName = `Linux 考试联调试卷 [${suffix}]`
const contents = {
  single: `Linux 中查看当前工作目录的命令是？ [${suffix}]`,
  multiple: `以下哪些属于 Linux 常见文件系统？ [${suffix}]`,
  trueFalse: `Kubernetes 是一个容器编排系统。 [${suffix}]`,
  fillBlank: `Linux 默认超级用户名称是 ______。 [${suffix}]`,
  subjective: `请简述 Docker 容器和虚拟机的主要区别。 [${suffix}]`,
}

const results = {
  teacherLogin: false,
  activePaperLoaded: false,
  classTargetLinked: false,
  draftCreatedAndOpened: false,
  draftEdited: false,
  publishedAndLocked: false,
  snapshotsReadable: false,
  manualSnapshotsReadable: false,
  snapshotsImmutableAfterQuestionEdit: false,
  repeatPublishRejected: false,
  allTargetDisplayed: false,
  majorTargetDisplayed: false,
  adminSeesTeacherExam: false,
  studentMenuHidden: false,
  studentForbidden: false,
  timezoneContractCorrect: false,
  studentMyExamsVisible: false,
  studentAttemptStarted: false,
  safeStudentQuestionContract: false,
  fiveStudentAnswersSaved: false,
  studentAnswersRestored: false,
  repeatedStartRestoresAttempt: false,
  latestSubjectiveAnswerWins: false,
  mixedAttemptSubmitted: false,
  teacherManualGradingCompleted: false,
  studentFinalResultVisible: false,
  teacherExamResultsVisible: false,
  pureObjectiveImmediatelyGraded: false,
}

const browser = await puppeteer.launch({
  executablePath: chromePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

let page
let setup
let paper
let exam
let liveExam
let pureExam
let currentStage = 'start'

try {
  page = await browser.newPage()
  await page.setViewport({ width: 1600, height: 1100 })
  page.setDefaultTimeout(30_000)
  page.on('dialog', async (dialog) => {
    await dialog.accept()
  })

  currentStage = 'admin-setup'
  await login(page, adminUsername, adminPassword)
  setup = await setupAccounts(page)

  currentStage = 'teacher-setup'
  await login(page, teacher.username, teacher.password)
  results.teacherLogin = true
  const questions = await createQuestions(page)
  paper = await createActivePaper(page, questions)

  currentStage = 'open-exams'
  await page.goto(`${frontendUrl}/exams`, { waitUntil: 'domcontentloaded' })
  await waitForText(page, '考试管理')
  await page.click('[data-e2e="create-exam"]')
  await waitForText(page, '新增考试草稿')
  currentStage = 'fill-class-target'
  await clearAndType(page, '[data-e2e="exam-name"]', examName)
  await selectOption(
    page,
    '[data-e2e="exam-paper"]',
    `${paperName}（100.00 分 / 5 题）`,
  )
  results.activePaperLoaded = true
  await clearAndType(page, '#exam-editor_description', '浏览器联调初始说明')
  await fillDatePicker(page, '[data-e2e="exam-start-time"]', '2026-07-30 09:00:00')
  await fillDatePicker(page, '[data-e2e="exam-end-time"]', '2026-07-30 11:00:00')
  // duration_minutes defaults to 90; only adjust the non-default pass score.
  await setNumberInput(page, '[data-e2e="exam-pass-score"]', '60')
  await page.evaluate(() => {
    const label = [...document.querySelectorAll('label')].find(
      (candidate) => candidate.textContent?.trim() === '指定班级',
    )
    label?.click()
  })
  await page.waitForSelector('[data-e2e="exam-target-class-major"]', {
    visible: true,
  })
  await selectOption(
    page,
    '[data-e2e="exam-target-class-major"]',
    `${setup.major.name} / ${setup.major.code}`,
  )
  await selectOption(
    page,
    '[data-e2e="exam-target-class"]',
    `${setup.classRecord.name} / ${setup.classRecord.code}`,
  )
  results.classTargetLinked = true

  currentStage = 'create-draft'
  const createResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/v1/exams') &&
      response.request().method() === 'POST' &&
      response.status() === 201,
  )
  await clickButtonByText(page, '保存草稿')
  exam = await (await createResponse).json()
  await page.waitForFunction(
    (id) => window.location.pathname === `/exams/${id}`,
    {},
    exam.id,
  )
  await waitForText(page, examName)
  results.draftCreatedAndOpened =
    exam.status === 'draft' &&
    exam.target.type === 'class' &&
    exam.target.id === setup.classRecord.id &&
    exam.total_score === '100.00'
  results.timezoneContractCorrect =
    exam.start_time === '2026-07-30T01:00:00' &&
    exam.end_time === '2026-07-30T03:00:00'

  currentStage = 'edit-draft'
  await page.click('[data-e2e="edit-exam-detail"]')
  await waitForText(page, '编辑考试草稿')
  await clearAndType(page, '#exam-editor_description', '浏览器联调已编辑说明')
  const updateResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/exams/${exam.id}`) &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '保存草稿')
  exam = await (await updateResponse).json()
  await waitForDrawerClosed(page)
  results.draftEdited = exam.description === '浏览器联调已编辑说明'

  currentStage = 'publish'
  await page.click('[data-e2e="publish-exam-detail"]')
  const publishResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/exams/${exam.id}/publish`) &&
      response.request().method() === 'POST' &&
      response.status() === 200,
  )
  await clickButtonByText(page, '确认发布')
  exam = await (await publishResponse).json()
  await waitForText(page, '考试已发布，核心配置和考试题目快照已冻结。')
  results.publishedAndLocked =
    exam.status === 'published' &&
    exam.total_score === '100.00' &&
    exam.snapshot_question_count === 5 &&
    exam.published_at !== null &&
    (await page.$('[data-e2e="edit-exam-detail"]')) === null

  currentStage = 'snapshot'
  const snapshotResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/exams/${exam.id}/questions`) &&
      response.request().method() === 'GET' &&
      response.status() === 200,
  )
  await page.click('[data-e2e="load-exam-snapshots"]')
  const originalSnapshots = await (await snapshotResponse).json()
  await waitForText(page, contents.single)
  results.snapshotsReadable =
    originalSnapshots.length === 5 &&
    originalSnapshots[0].content === contents.single &&
    originalSnapshots[0].options[0].content === 'pwd' &&
    originalSnapshots[0].correct_answer.join(',') === 'A' &&
    originalSnapshots.map((item) => item.score).join(',') ===
      '20.00,20.00,20.00,15.00,25.00'

  const subjectiveSnapshot = originalSnapshots.find(
    (item) => item.question_type === 'subjective',
  )
  if (!subjectiveSnapshot) {
    throw new Error('Subjective snapshot was not generated')
  }
  await page.evaluate((questionContent) => {
    const row = [...document.querySelectorAll('tbody tr')].find((candidate) =>
      candidate.textContent?.includes(questionContent),
    )
    row?.querySelector('.ant-table-row-expand-icon')?.click()
  }, contents.subjective)
  await waitForText(
    page,
    '容器共享宿主机内核，虚拟机运行完整的客户操作系统。',
  )
  results.manualSnapshotsReadable =
    subjectiveSnapshot?.correct_answer === null &&
    subjectiveSnapshot?.options === null &&
    subjectiveSnapshot?.reference_answer ===
      '容器共享宿主机内核，虚拟机运行完整的客户操作系统。'

  currentStage = 'snapshot-immutability'
  await mutateManualQuestion(page, subjectiveSnapshot.original_question_id)
  const refreshedSnapshots = await browserRequest(
    page,
    `/api/v1/exams/${exam.id}/questions`,
  )
  results.snapshotsImmutableAfterQuestionEdit =
    JSON.stringify(refreshedSnapshots) === JSON.stringify(originalSnapshots)

  currentStage = 'repeat-publish'
  const repeated = await browserRequest(
    page,
    `/api/v1/exams/${exam.id}/publish`,
    { method: 'POST', allowError: true },
  )
  const snapshotsAfterRepeat = await browserRequest(
    page,
    `/api/v1/exams/${exam.id}/questions`,
  )
  results.repeatPublishRejected =
    repeated.status === 409 && snapshotsAfterRepeat.length === 5

  currentStage = 'other-targets'
  const allExam = await createDraftByApi(page, {
    name: `全部学生考试 [${suffix}]`,
    paperId: paper.id,
    target: { target_type: 'all', target_id: null },
  })
  const majorExam = await createDraftByApi(page, {
    name: `云计算专业考试 [${suffix}]`,
    paperId: paper.id,
    target: { target_type: 'major', target_id: setup.major.id },
  })
  await page.goto(`${frontendUrl}/exams`, { waitUntil: 'domcontentloaded' })
  await waitForText(page, '考试管理')
  await clearAndType(page, '[data-e2e="exam-keyword"]', suffix)
  await clickButtonByText(page, '查询')
  await waitForText(page, allExam.name)
  await waitForText(page, majorExam.name)
  results.allTargetDisplayed = Boolean(
    await page.evaluate((name) => document.body.textContent?.includes(name), '全部学生'),
  )
  results.majorTargetDisplayed = Boolean(
    await page.evaluate(
      (name) => document.body.textContent?.includes(name),
      setup.major.name,
    ),
  )

  currentStage = 'admin-check'
  await login(page, adminUsername, adminPassword)
  await page.goto(`${frontendUrl}/exams`, { waitUntil: 'domcontentloaded' })
  await waitForText(page, '考试管理')
  await clearAndType(page, '[data-e2e="exam-keyword"]', suffix)
  await clickButtonByText(page, '查询')
  await waitForText(page, examName)
  results.adminSeesTeacherExam = true

  currentStage = 'create-live-student-exam'
  await login(page, teacher.username, teacher.password)
  liveExam = await createLiveExamByApi(page, {
    name: `学生在线五题型考试 [${suffix}]`,
    paperId: paper.id,
    classId: setup.classRecord.id,
  })
  const purePaper = await createPureObjectivePaper(page, questions)
  pureExam = await createLiveExamByApi(page, {
    name: `学生纯客观考试 [${suffix}]`,
    paperId: purePaper.id,
    classId: setup.classRecord.id,
  })

  currentStage = 'student-check'
  await login(page, student.username, student.password)
  results.studentMenuHidden = await page.evaluate(
    () =>
      ![...document.querySelectorAll('.ant-menu-item')].some(
        (item) => item.textContent?.trim() === '考试管理',
      ),
  )
  await page.goto(`${frontendUrl}/exams`, { waitUntil: 'domcontentloaded' })
  await waitForText(page, '无权限访问')
  results.studentForbidden = (await windowPath(page)) === '/403'

  currentStage = 'student-my-exams'
  await page.goto(`${frontendUrl}/my-exams`, { waitUntil: 'domcontentloaded' })
  await waitForText(page, '我的考试')
  await waitForText(page, liveExam.name)
  results.studentMyExamsVisible = true

  currentStage = 'student-start'
  const startResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/my-exams/${liveExam.id}/start`) &&
      response.request().method() === 'POST' &&
      response.status() === 200,
  )
  await page.click(`[data-e2e="start-exam-${liveExam.id}"]`)
  await clickButtonByText(page, '确认开始')
  const attempt = await (await startResponse).json()
  await page.waitForFunction(
    (attemptId) => window.location.pathname === `/attempts/${attemptId}`,
    {},
    attempt.attempt_id,
  )
  await page.waitForSelector('[data-e2e="online-exam"]')
  results.studentAttemptStarted =
    attempt.status === 'in_progress' && attempt.questions.length === 5
  results.safeStudentQuestionContract = attempt.questions.every(
    (question) =>
      !Object.hasOwn(question, 'correct_answer') &&
      !Object.hasOwn(question, 'reference_answer') &&
      !Object.hasOwn(question, 'analysis') &&
      !Object.hasOwn(question, 'original_question_id'),
  )

  currentStage = 'student-five-answers'
  await selectStudentOption(page, attempt.questions[0].exam_question_id, 'A')
  await page.click('[data-e2e="question-nav-2"]')
  await selectStudentOption(page, attempt.questions[1].exam_question_id, 'A')
  await selectStudentOption(page, attempt.questions[1].exam_question_id, 'B')
  await selectStudentOption(page, attempt.questions[1].exam_question_id, 'D')
  await page.click('[data-e2e="question-nav-3"]')
  await selectStudentOption(page, attempt.questions[2].exam_question_id, 'true')
  await page.click('[data-e2e="question-nav-4"]')
  await typeStudentAnswer(
    page,
    attempt.attempt_id,
    attempt.questions[3].exam_question_id,
    `[data-e2e="answer-${attempt.questions[3].exam_question_id}"]`,
    'root',
  )
  await page.click('[data-e2e="question-nav-5"]')
  await typeStudentAnswer(
    page,
    attempt.attempt_id,
    attempt.questions[4].exam_question_id,
    `[data-e2e="answer-${attempt.questions[4].exam_question_id}"]`,
    '第一行回答\n第二行回答',
  )
  await waitForSaveStatus(page, '已保存')
  let restoredAttempt = await browserRequest(
    page,
    `/api/v1/attempts/${attempt.attempt_id}`,
  )
  results.fiveStudentAnswersSaved =
    restoredAttempt.questions.map((question) => JSON.stringify(question.saved_answer)).join('|') ===
    '["A"]|["A","B","D"]|["true"]|["root"]|["第一行回答\\n第二行回答"]'

  currentStage = 'student-refresh-restore'
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-e2e="online-exam"]')
  await page.click('[data-e2e="question-nav-4"]')
  const restoredFillBlank = await page.$eval(
    `[data-e2e="answer-${attempt.questions[3].exam_question_id}"]`,
    (input) => input.value,
  )
  await page.click('[data-e2e="question-nav-5"]')
  const restoredSubjective = await page.$eval(
    `[data-e2e="answer-${attempt.questions[4].exam_question_id}"]`,
    (input) => input.value,
  )
  results.studentAnswersRestored =
    restoredFillBlank === 'root' &&
    restoredSubjective === '第一行回答\n第二行回答'

  currentStage = 'student-repeat-start'
  const repeatedAttempt = await browserRequest(
    page,
    `/api/v1/my-exams/${liveExam.id}/start`,
    { method: 'POST' },
  )
  results.repeatedStartRestoresAttempt =
    repeatedAttempt.attempt_id === attempt.attempt_id

  currentStage = 'student-latest-answer'
  const subjectiveSelector =
    `[data-e2e="answer-${attempt.questions[4].exam_question_id}"]`
  await replaceText(page, subjectiveSelector, '快速修改旧版本')
  await typeStudentAnswer(
    page,
    attempt.attempt_id,
    attempt.questions[4].exam_question_id,
    subjectiveSelector,
    '最终保留的新版本',
  )
  await waitForSaveStatus(page, '已保存')
  restoredAttempt = await browserRequest(
    page,
    `/api/v1/attempts/${attempt.attempt_id}`,
  )
  results.latestSubjectiveAnswerWins =
    restoredAttempt.questions[4].saved_answer?.[0] === '最终保留的新版本'

  currentStage = 'student-close-and-continue'
  await page.goto(`${frontendUrl}/my-exams`, { waitUntil: 'domcontentloaded' })
  await waitForText(page, liveExam.name)
  await page.click(`[data-e2e="continue-attempt-${attempt.attempt_id}"]`)
  await page.waitForFunction(
    (attemptId) => window.location.pathname === `/attempts/${attemptId}`,
    {},
    attempt.attempt_id,
  )
  await page.waitForSelector('[data-e2e="online-exam"]')

  currentStage = 'student-submit-mixed'
  const submitResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/attempts/${attempt.attempt_id}/submit`) &&
      response.request().method() === 'POST' &&
      response.status() === 200,
  )
  await page.click('[data-e2e="submit-attempt"]')
  await clickButtonByText(page, '确认交卷')
  const submitted = await (await submitResponse).json()
  await waitForText(page, '已交卷，等待教师人工阅卷')
  results.mixedAttemptSubmitted =
    submitted.grading_status === 'pending_manual_grading' &&
    submitted.objective_score === '60.00' &&
    submitted.score === null

  currentStage = 'teacher-manual-grading'
  await login(page, teacher.username, teacher.password)
  await page.goto(`${frontendUrl}/results`, { waitUntil: 'domcontentloaded' })
  await waitForText(page, liveExam.name)
  await page.click(`[data-e2e="grade-attempt-${attempt.attempt_id}"]`)
  await page.waitForSelector('[data-e2e="grading-detail-page"]')
  await setNumberInput(page, '[aria-label="第4题给分"]', '12')
  await clearAndType(page, '[aria-label="第4题评语"]', '填空题基本正确')
  const firstGrade = page.waitForResponse(
    (response) =>
      response.url().endsWith(
        `/grading/attempts/${attempt.attempt_id}/answers/${attempt.questions[3].exam_question_id}`,
      ) &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
  )
  await page.click('[data-e2e="save-grade-4"]')
  await firstGrade
  await setNumberInput(page, '[aria-label="第5题给分"]', '20')
  await clearAndType(page, '[aria-label="第5题评语"]', '主观题说明完整')
  const finalGrade = page.waitForResponse(
    (response) =>
      response.url().endsWith(
        `/grading/attempts/${attempt.attempt_id}/answers/${attempt.questions[4].exam_question_id}`,
      ) &&
      response.request().method() === 'PUT' &&
      response.status() === 200,
  )
  await page.click('[data-e2e="save-grade-5"]')
  const graded = await (await finalGrade).json()
  await waitForText(page, '阅卷完成，最终成绩 92.00，及格')
  results.teacherManualGradingCompleted =
    graded.grading_status === 'graded' &&
    graded.objective_score === '60.00' &&
    graded.manual_score === '32.00' &&
    graded.score === '92.00' &&
    graded.is_passed === true

  currentStage = 'teacher-exam-results'
  await page.goto(`${frontendUrl}/exams/${liveExam.id}/results`, {
    waitUntil: 'domcontentloaded',
  })
  await waitForText(page, student.realName)
  await waitForText(page, '92.00')
  results.teacherExamResultsVisible = true

  currentStage = 'student-final-result'
  await login(page, student.username, student.password)
  await page.goto(`${frontendUrl}/my-results`, { waitUntil: 'domcontentloaded' })
  await waitForText(page, liveExam.name)
  await waitForText(page, '92.00 / 100.00')
  results.studentFinalResultVisible = true

  currentStage = 'pure-objective-submit'
  const pureStarted = await browserRequest(
    page,
    `/api/v1/my-exams/${pureExam.id}/start`,
    { method: 'POST' },
  )
  await page.goto(`${frontendUrl}/attempts/${pureStarted.attempt_id}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('[data-e2e="online-exam"]')
  await selectStudentOption(page, pureStarted.questions[0].exam_question_id, 'A')
  await page.click('[data-e2e="question-nav-2"]')
  await selectStudentOption(page, pureStarted.questions[1].exam_question_id, 'A')
  await selectStudentOption(page, pureStarted.questions[1].exam_question_id, 'B')
  await selectStudentOption(page, pureStarted.questions[1].exam_question_id, 'D')
  await page.click('[data-e2e="question-nav-3"]')
  await selectStudentOption(page, pureStarted.questions[2].exam_question_id, 'true')
  const pureSubmitResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/api/v1/attempts/${pureStarted.attempt_id}/submit`) &&
      response.request().method() === 'POST' &&
      response.status() === 200,
  )
  await page.click('[data-e2e="submit-attempt"]')
  await clickButtonByText(page, '确认交卷')
  const pureSubmitted = await (await pureSubmitResponse).json()
  await waitForText(page, '已完成，最终成绩 60.00')
  results.pureObjectiveImmediatelyGraded =
    pureSubmitted.grading_status === 'graded' &&
    pureSubmitted.score === '60.00' &&
    pureSubmitted.is_passed === true

  if (screenshotPrefix) {
    await page.screenshot({ path: `${screenshotPrefix}-student-attempt.png`, fullPage: true })
  }

  const failed = Object.entries(results).filter(([, value]) => value !== true)
  console.log(JSON.stringify({ suffix, teacher: teacher.username, examId: exam.id, results }, null, 2))
  if (failed.length > 0) {
    throw new Error(`Failed browser assertions: ${failed.map(([key]) => key).join(', ')}`)
  }
} catch (error) {
  if (page && screenshotPrefix) {
    await page.screenshot({
      path: `${screenshotPrefix}-failed-${currentStage}.png`,
      fullPage: true,
    }).catch(() => undefined)
  }
  throw new Error(`Exam browser smoke failed at ${currentStage}: ${error.message}`, {
    cause: error,
  })
} finally {
  if (page && setup) {
    await disableAccounts(page).catch(() => undefined)
  }
  await browser.close()
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

async function setupAccounts(page) {
  return page.evaluate(
    async ({ apiBaseUrl, teacherData, studentData }) => {
      const token = localStorage.getItem('exam-system.access-token')
      const request = async (path, init = {}) => {
        const response = await fetch(`${apiBaseUrl}${path}`, {
          ...init,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        })
        const body = await response.json()
        if (!response.ok) throw new Error(`${path}: ${response.status} ${JSON.stringify(body)}`)
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
      const majorPage = await request('/api/v1/majors?page=1&page_size=1&status=active')
      const major = majorPage.items[0]
      if (!major) throw new Error('No active major')
      const classPage = await request(
        `/api/v1/classes?page=1&page_size=1&status=active&major_id=${major.id}`,
      )
      let classRecord = classPage.items[0]
      let temporaryClass = null
      if (!classRecord) {
        temporaryClass = await request('/api/v1/classes', {
          method: 'POST',
          body: JSON.stringify({
            major_id: major.id,
            name: `考试联调班级${teacherData.username.slice(-8)}`,
            code: `EXAM-E2E-${teacherData.username.slice(-8)}`,
            enrollment_year: 2026,
            description: '考试浏览器联调临时班级',
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
      return { teacherRecord, studentRecord, major, classRecord, temporaryClass }
    },
    { apiBaseUrl: apiUrl, teacherData: teacher, studentData: student },
  )
}

async function createQuestions(page) {
  const payloads = [
    {
      question_type: 'single_choice',
      content: contents.single,
      options: [
        ['A', 'pwd'], ['B', 'cd'], ['C', 'mkdir'], ['D', 'touch'],
      ].map(([option_key, option_content], index) => ({
        option_key, option_content, sort_order: index + 1,
      })),
      correct_answer: ['A'],
      reference_answer: null,
      analysis: 'pwd 用于显示当前工作目录。',
      difficulty: 'easy',
    },
    {
      question_type: 'multiple_choice',
      content: contents.multiple,
      options: [
        ['A', 'ext4'], ['B', 'XFS'], ['C', 'NTFS'], ['D', 'Btrfs'],
      ].map(([option_key, option_content], index) => ({
        option_key, option_content, sort_order: index + 1,
      })),
      correct_answer: ['A', 'B', 'D'],
      reference_answer: null,
      analysis: 'ext4、XFS 和 Btrfs 是 Linux 常见文件系统。',
      difficulty: 'medium',
    },
    {
      question_type: 'true_false',
      content: contents.trueFalse,
      options: [],
      correct_answer: ['true'],
      reference_answer: null,
      analysis: 'Kubernetes 用于容器编排。',
      difficulty: 'easy',
    },
    {
      question_type: 'fill_blank',
      content: contents.fillBlank,
      options: [],
      correct_answer: null,
      reference_answer: 'root',
      analysis: 'Linux 默认超级用户为 root。',
      difficulty: 'easy',
    },
    {
      question_type: 'subjective',
      content: contents.subjective,
      options: [],
      correct_answer: null,
      reference_answer: '容器共享宿主机内核，虚拟机运行完整的客户操作系统。',
      analysis: null,
      difficulty: 'medium',
    },
  ]
  const questions = []
  for (const payload of payloads) {
    questions.push(await browserRequest(page, '/api/v1/questions', {
      method: 'POST',
      body: payload,
    }))
  }
  return questions
}

async function createActivePaper(page, questions) {
  let created = await browserRequest(page, '/api/v1/papers', {
    method: 'POST',
    body: { name: paperName, description: '考试前端联调 active 试卷' },
  })
  created = await browserRequest(page, `/api/v1/papers/${created.id}/questions`, {
    method: 'POST',
    body: {
      items: questions.map((question, index) => ({
        question_id: question.id,
        score: ['20.00', '20.00', '20.00', '15.00', '25.00'][index],
      })),
    },
  })
  return browserRequest(page, `/api/v1/papers/${created.id}/status`, {
    method: 'PATCH',
    body: { status: 'active' },
  })
}

async function createPureObjectivePaper(page, questions) {
  let created = await browserRequest(page, '/api/v1/papers', {
    method: 'POST',
    body: {
      name: `Linux 纯客观联调试卷 [${suffix}]`,
      description: '浏览器纯客观评分联调',
    },
  })
  created = await browserRequest(page, `/api/v1/papers/${created.id}/questions`, {
    method: 'POST',
    body: {
      items: questions.slice(0, 3).map((question) => ({
        question_id: question.id,
        score: '20.00',
      })),
    },
  })
  return browserRequest(page, `/api/v1/papers/${created.id}/status`, {
    method: 'PATCH',
    body: { status: 'active' },
  })
}

async function createDraftByApi(page, { name, paperId, target }) {
  return browserRequest(page, '/api/v1/exams', {
    method: 'POST',
    body: {
      name,
      paper_id: paperId,
      description: '考试对象联调',
      start_time: '2026-07-30T01:00:00',
      end_time: '2026-07-30T03:00:00',
      duration_minutes: 90,
      pass_score: '6.00',
      target,
    },
  })
}

async function createLiveExamByApi(page, { name, paperId, classId }) {
  const now = Date.now()
  const formatUtcNaive = (date) => new Date(date).toISOString().slice(0, 19)
  const draft = await browserRequest(page, '/api/v1/exams', {
    method: 'POST',
    body: {
      name,
      paper_id: paperId,
      description: '学生在线考试浏览器联调',
      start_time: formatUtcNaive(now - 60_000),
      end_time: formatUtcNaive(now + 10 * 60_000),
      duration_minutes: 90,
      pass_score: '60.00',
      target: { target_type: 'class', target_id: classId },
    },
  })
  return browserRequest(page, `/api/v1/exams/${draft.id}/publish`, {
    method: 'POST',
  })
}

async function mutateManualQuestion(page, questionId) {
  const detail = await browserRequest(page, `/api/v1/questions/${questionId}`)
  return browserRequest(page, `/api/v1/questions/${questionId}`, {
    method: 'PUT',
    body: {
      question_type: detail.question_type,
      content: detail.content,
      options: [],
      correct_answer: null,
      reference_answer: '发布后修改的新参考答案 B',
      analysis: detail.analysis,
      difficulty: detail.difficulty,
    },
  })
}

async function browserRequest(page, path, options = {}) {
  return page.evaluate(
    async ({ baseUrl, requestPath, requestOptions }) => {
      const token = localStorage.getItem('exam-system.access-token')
      const response = await fetch(`${baseUrl}${requestPath}`, {
        method: requestOptions.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(requestOptions.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: requestOptions.body ? JSON.stringify(requestOptions.body) : undefined,
      })
      let body = null
      try {
        body = await response.json()
      } catch {
        body = null
      }
      if (!response.ok && !requestOptions.allowError) {
        throw new Error(`${requestPath}: ${response.status} ${JSON.stringify(body)}`)
      }
      return requestOptions.allowError ? { status: response.status, body } : body
    },
    { baseUrl: apiUrl, requestPath: path, requestOptions: options },
  )
}

async function disableAccounts(page) {
  await login(page, adminUsername, adminPassword)
  await browserRequest(page, `/api/v1/teachers/${setup.teacherRecord.id}/status`, {
    method: 'PATCH',
    body: { status: 'disabled' },
  })
  await browserRequest(page, `/api/v1/students/${setup.studentRecord.id}/status`, {
    method: 'PATCH',
    body: { status: 'disabled' },
  })
  if (setup.temporaryClass) {
    await browserRequest(page, `/api/v1/classes/${setup.temporaryClass.id}/status`, {
      method: 'PATCH',
      body: { status: 'disabled' },
    })
  }
}

async function selectOption(page, selector, label) {
  await page.click(selector)
  await page.waitForFunction(
    (expected) =>
      [...document.querySelectorAll('.ant-select-item-option-content')].some(
        (option) =>
          option.textContent?.trim() === expected &&
          option.closest('.ant-select-dropdown')?.getBoundingClientRect().width > 0,
      ),
    {},
    label,
  )
  await page.evaluate((expected) => {
    const option = [...document.querySelectorAll('.ant-select-item-option-content')].find(
      (candidate) =>
        candidate.textContent?.trim() === expected &&
        candidate.closest('.ant-select-dropdown')?.getBoundingClientRect().width > 0,
    )
    option?.parentElement?.click()
  }, label)
  await page.waitForFunction(
    (selectSelector, expected) =>
      document.querySelector(selectSelector)?.textContent?.includes(expected),
    {},
    selector,
    label,
  )
}

async function fillDatePicker(page, selector, value) {
  await clearAndType(page, selector, value)
  await page.keyboard.press('Enter')
}

async function setNumberInput(page, selector, value) {
  await page.waitForSelector(selector, { visible: true })
  await page.evaluate((inputSelector) => {
    document.querySelector(inputSelector)?.focus()
  }, selector)
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  await page.keyboard.type(value)
  await page.keyboard.press('Tab')
}

async function clearAndType(page, selector, value) {
  await page.waitForSelector(selector, { visible: true })
  await page.click(selector, { clickCount: 3 })
  await page.keyboard.press('Backspace')
  await page.type(selector, value)
}

async function selectStudentOption(page, questionId, value) {
  await page.waitForSelector(`[data-e2e="answer-${questionId}"]`, {
    visible: true,
  })
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(`/answers/${questionId}`) &&
      candidate.request().method() === 'PUT' &&
      candidate.status() === 200,
  )
  await page.evaluate(
    ({ id, selectedValue }) => {
      const group = document.querySelector(`[data-e2e="answer-${id}"]`)
      const control = [...(group?.querySelectorAll('input') ?? [])].find(
        (candidate) => candidate.value === selectedValue,
      )
      control?.closest('label')?.click()
    },
    { id: questionId, selectedValue: value },
  )
  await response
}

async function typeStudentAnswer(
  page,
  attemptId,
  questionId,
  selector,
  value,
) {
  const response = page.waitForResponse(
    (candidate) =>
      candidate.url().endsWith(
        `/api/v1/attempts/${attemptId}/answers/${questionId}`,
      ) &&
      candidate.request().method() === 'PUT' &&
      candidate.status() === 200,
  )
  await replaceText(page, selector, value)
  await response
}

async function replaceText(page, selector, value) {
  await page.waitForSelector(selector, { visible: true })
  await page.click(selector)
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  await page.type(selector, value)
}

async function waitForSaveStatus(page, status) {
  await page.waitForFunction(
    (expected) =>
      document.querySelector('[data-e2e="save-status"]')?.textContent
        ?.replace(/\s/gu, '')
        .includes(expected),
    {},
    status,
  )
}

async function clickButtonByText(page, text) {
  await page.waitForFunction(
    (expected) =>
      [...document.querySelectorAll('button')].some(
        (button) =>
          button.textContent?.replace(/\s/gu, '') === expected &&
          !button.disabled &&
          button.getBoundingClientRect().width > 0,
      ),
    {},
    text,
  )
  await page.evaluate((expected) => {
    const button = [...document.querySelectorAll('button')].find(
      (candidate) =>
        candidate.textContent?.replace(/\s/gu, '') === expected &&
        !candidate.disabled &&
        candidate.getBoundingClientRect().width > 0,
    )
    button?.click()
  }, text)
}

async function waitForText(page, text) {
  await page.waitForFunction(
    (expected) => document.body.textContent?.includes(expected),
    {},
    text,
  )
}

async function waitForDrawerClosed(page) {
  await page.waitForFunction(
    () =>
      ![...document.querySelectorAll('.ant-drawer-content-wrapper')].some((wrapper) => {
        const bounds = wrapper.getBoundingClientRect()
        return bounds.width > 0 && bounds.left < innerWidth && bounds.right > 0
      }),
  )
}

async function windowPath(page) {
  return page.evaluate(() => window.location.pathname)
}
