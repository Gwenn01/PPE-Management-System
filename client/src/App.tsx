import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import DashboardLayout from './layouts/DashboardLayout'
import DashboardHome from './pages/dashboard/DashboardHome'
import ModulePage from './pages/dashboard/ModulePage'
import RequirePermission from './features/access/RequirePermission'
import AccessDenied from './features/access/AccessDenied'
import CurrentUserProvider from './context/CurrentUserProvider'
import { dashboardRoute, navItems } from './config/navigation'
import MockDataBoundary from './features/data/MockDataBoundary'

function App() {
  return (
    <CurrentUserProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          <Route path="/dashboard" element={<MockDataBoundary><DashboardLayout /></MockDataBoundary>}>
            <Route index element={
              <RequirePermission permission={dashboardRoute.permission}>
                <DashboardHome />
              </RequirePermission>
            } />
            <Route path="access-denied" element={<AccessDenied />} />
            {navItems
              .filter((item) => item.path !== '')
              .map((item) => (
                <Route
                  key={item.path}
                  path={item.path}
                  element={
                    <RequirePermission permission={item.permission}>
                      <ModulePage item={item} />
                    </RequirePermission>
                  }
                />
              ))}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </CurrentUserProvider>
  )
}

export default App
