import { Navigate, createBrowserRouter } from 'react-router-dom'

import { ProtectedRoute } from '../components/ProtectedRoute'
import { PublicOnlyRoute } from '../components/PublicOnlyRoute'
import { RoleRoute } from '../components/RoleRoute'
import { AppLayout } from '../layouts/AppLayout'
import { ComingSoonPage } from '../pages/ComingSoonPage'
import { ClassesPage } from '../pages/ClassesPage'
import { DashboardPage } from '../pages/DashboardPage'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import { LoginPage } from '../pages/LoginPage'
import { MajorsPage } from '../pages/MajorsPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { navigationItems } from './navigation'

const placeholderRoutes = navigationItems
  .filter((item) => !['dashboard', 'majors', 'classes'].includes(item.key))
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
            path: '/classes',
            element: (
              <RoleRoute allowedRoles={['admin']}>
                <ClassesPage />
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
