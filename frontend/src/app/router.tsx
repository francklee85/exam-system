import { Navigate, createBrowserRouter } from 'react-router-dom'

import { ProtectedRoute } from '../components/ProtectedRoute'
import { PublicOnlyRoute } from '../components/PublicOnlyRoute'
import { RoleRoute } from '../components/RoleRoute'
import { AppLayout } from '../layouts/AppLayout'
import { ComingSoonPage } from '../pages/ComingSoonPage'
import { ClassesPage } from '../pages/ClassesPage'
import { DashboardPage } from '../pages/DashboardPage'
import { ExamDetailPage } from '../pages/ExamDetailPage'
import { ExamsPage } from '../pages/ExamsPage'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import { LoginPage } from '../pages/LoginPage'
import { MajorsPage } from '../pages/MajorsPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { PaperDetailPage } from '../pages/PaperDetailPage'
import { PapersPage } from '../pages/PapersPage'
import { QuestionsPage } from '../pages/QuestionsPage'
import { StudentsPage } from '../pages/StudentsPage'
import { TeachersPage } from '../pages/TeachersPage'
import { UsersPage } from '../pages/UsersPage'
import { navigationItems } from './navigation'

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
        <LoginPage />
      </PublicOnlyRoute>
    ),
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
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
          ...placeholderRoutes,
        ],
      },
      {
        path: '/403',
        element: <ForbiddenPage />,
      },
    ],
  },
  {
    path: '*',
    element: <NotFoundPage />,
  },
])
