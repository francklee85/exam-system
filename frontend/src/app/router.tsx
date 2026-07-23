import { Navigate, createBrowserRouter } from 'react-router-dom'

import { ProtectedRoute } from '../components/ProtectedRoute'
import { PublicOnlyRoute } from '../components/PublicOnlyRoute'
import { RoleRoute } from '../components/RoleRoute'
import { AppLayout } from '../layouts/AppLayout'
import { ComingSoonPage } from '../pages/ComingSoonPage'
import { DashboardPage } from '../pages/DashboardPage'
import { ForbiddenPage } from '../pages/ForbiddenPage'
import { LoginPage } from '../pages/LoginPage'
import { NotFoundPage } from '../pages/NotFoundPage'
import { navigationItems } from './navigation'

const placeholderRoutes = navigationItems
  .filter((item) => item.key !== 'dashboard')
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
