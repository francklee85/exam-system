import { Suspense, lazy, type ReactNode } from 'react'
import { Navigate, createBrowserRouter } from 'react-router-dom'

import { FullPageLoading } from '../components/FullPageLoading'
import { ProtectedRoute } from '../components/ProtectedRoute'
import { PublicOnlyRoute } from '../components/PublicOnlyRoute'
import { RoleRoute } from '../components/RoleRoute'
import { AppLayout } from '../layouts/AppLayout'
import { ComingSoonPage } from '../pages/ComingSoonPage'
import { navigationItems } from './navigation'

const ClassesPage = lazy(() =>
  import('../pages/ClassesPage').then((module) => ({ default: module.ClassesPage })),
)
const DashboardPage = lazy(() =>
  import('../pages/DashboardPage').then((module) => ({ default: module.DashboardPage })),
)
const ExamDetailPage = lazy(() =>
  import('../pages/ExamDetailPage').then((module) => ({ default: module.ExamDetailPage })),
)
const ExamResultsPage = lazy(() =>
  import('../pages/ExamResultsPage').then((module) => ({ default: module.ExamResultsPage })),
)
const ExamsPage = lazy(() =>
  import('../pages/ExamsPage').then((module) => ({ default: module.ExamsPage })),
)
const ForbiddenPage = lazy(() =>
  import('../pages/ForbiddenPage').then((module) => ({ default: module.ForbiddenPage })),
)
const GradingDetailPage = lazy(() =>
  import('../pages/GradingDetailPage').then((module) => ({ default: module.GradingDetailPage })),
)
const GradingTasksPage = lazy(() =>
  import('../pages/GradingTasksPage').then((module) => ({ default: module.GradingTasksPage })),
)
const LoginPage = lazy(() =>
  import('../pages/LoginPage').then((module) => ({ default: module.LoginPage })),
)
const MajorsPage = lazy(() =>
  import('../pages/MajorsPage').then((module) => ({ default: module.MajorsPage })),
)
const MyExamDetailPage = lazy(() =>
  import('../pages/MyExamDetailPage').then((module) => ({ default: module.MyExamDetailPage })),
)
const MyExamsPage = lazy(() =>
  import('../pages/MyExamsPage').then((module) => ({ default: module.MyExamsPage })),
)
const MyResultsPage = lazy(() =>
  import('../pages/MyResultsPage').then((module) => ({ default: module.MyResultsPage })),
)
const NotFoundPage = lazy(() =>
  import('../pages/NotFoundPage').then((module) => ({ default: module.NotFoundPage })),
)
const OnlineExamPage = lazy(() =>
  import('../pages/OnlineExamPage').then((module) => ({ default: module.OnlineExamPage })),
)
const PaperDetailPage = lazy(() =>
  import('../pages/PaperDetailPage').then((module) => ({ default: module.PaperDetailPage })),
)
const PapersPage = lazy(() =>
  import('../pages/PapersPage').then((module) => ({ default: module.PapersPage })),
)
const QuestionsPage = lazy(() =>
  import('../pages/QuestionsPage').then((module) => ({ default: module.QuestionsPage })),
)
const StudentsPage = lazy(() =>
  import('../pages/StudentsPage').then((module) => ({ default: module.StudentsPage })),
)
const TeachersPage = lazy(() =>
  import('../pages/TeachersPage').then((module) => ({ default: module.TeachersPage })),
)
const UsersPage = lazy(() =>
  import('../pages/UsersPage').then((module) => ({ default: module.UsersPage })),
)

function withLoading(element: ReactNode) {
  return <Suspense fallback={<FullPageLoading />}>{element}</Suspense>
}

const placeholderRoutes = navigationItems
  .filter(
    (item) =>
      ![
        'dashboard',
        'users',
        'teachers',
        'students',
        'majors',
        'classes',
        'questions',
        'papers',
        'exams',
        'my-exams',
        'results',
        'my-results',
      ].includes(item.key),
  )
  .map((item) => ({
    path: item.path,
    element: (
      <RoleRoute allowedRoles={item.allowedRoles}>
        <ComingSoonPage title={item.label} description={item.description} />
      </RoleRoute>
    ),
  }))

export const router = createBrowserRouter([
  {
    path: '/login',
    element: (
      <PublicOnlyRoute>
        {withLoading(<LoginPage />)}
      </PublicOnlyRoute>
    ),
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: withLoading(<AppLayout />),
        children: [
          {
            path: '/',
            element: <Navigate to="/dashboard" replace />,
          },
          {
            path: '/dashboard',
            element: <DashboardPage />,
          },
          {
            path: '/majors',
            element: (
              <RoleRoute allowedRoles={['admin']}>
                <MajorsPage />
              </RoleRoute>
            ),
          },
          {
            path: '/users',
            element: (
              <RoleRoute allowedRoles={['admin']}>
                <UsersPage />
              </RoleRoute>
            ),
          },
          {
            path: '/teachers',
            element: (
              <RoleRoute allowedRoles={['admin']}>
                <TeachersPage />
              </RoleRoute>
            ),
          },
          {
            path: '/students',
            element: (
              <RoleRoute allowedRoles={['admin']}>
                <StudentsPage />
              </RoleRoute>
            ),
          },
          {
            path: '/classes',
            element: (
              <RoleRoute allowedRoles={['admin']}>
                <ClassesPage />
              </RoleRoute>
            ),
          },
          {
            path: '/questions',
            element: (
              <RoleRoute allowedRoles={['admin', 'teacher']}>
                <QuestionsPage />
              </RoleRoute>
            ),
          },
          {
            path: '/papers',
            element: (
              <RoleRoute allowedRoles={['admin', 'teacher']}>
                <PapersPage />
              </RoleRoute>
            ),
          },
          {
            path: '/papers/:paperId',
            element: (
              <RoleRoute allowedRoles={['admin', 'teacher']}>
                <PaperDetailPage />
              </RoleRoute>
            ),
          },
          {
            path: '/exams',
            element: (
              <RoleRoute allowedRoles={['admin', 'teacher']}>
                <ExamsPage />
              </RoleRoute>
            ),
          },
          {
            path: '/exams/:examId',
            element: (
              <RoleRoute allowedRoles={['admin', 'teacher']}>
                <ExamDetailPage />
              </RoleRoute>
            ),
          },
          {
            path: '/exams/:examId/results',
            element: (
              <RoleRoute allowedRoles={['admin', 'teacher']}>
                <ExamResultsPage />
              </RoleRoute>
            ),
          },
          {
            path: '/results',
            element: (
              <RoleRoute allowedRoles={['admin', 'teacher']}>
                <GradingTasksPage />
              </RoleRoute>
            ),
          },
          {
            path: '/grading/:attemptId',
            element: (
              <RoleRoute allowedRoles={['admin', 'teacher']}>
                <GradingDetailPage />
              </RoleRoute>
            ),
          },
          {
            path: '/my-exams',
            element: (
              <RoleRoute allowedRoles={['student']}>
                <MyExamsPage />
              </RoleRoute>
            ),
          },
          {
            path: '/my-exams/:examId',
            element: (
              <RoleRoute allowedRoles={['student']}>
                <MyExamDetailPage />
              </RoleRoute>
            ),
          },
          {
            path: '/attempts/:attemptId',
            element: (
              <RoleRoute allowedRoles={['student']}>
                <OnlineExamPage />
              </RoleRoute>
            ),
          },
          {
            path: '/my-results',
            element: (
              <RoleRoute allowedRoles={['student']}>
                <MyResultsPage />
              </RoleRoute>
            ),
          },
          ...placeholderRoutes,
        ],
      },
      {
        path: '/403',
        element: withLoading(<ForbiddenPage />),
      },
    ],
  },
  {
    path: '*',
    element: withLoading(<NotFoundPage />),
  },
])
