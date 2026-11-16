import { Route, Routes } from 'react-router-dom'
import { RequireAdmin } from './auth/RequireAdmin'
import { RequireConsumer } from './auth/RequireConsumer'
import { AppLayout } from './components/AppLayout'
import { LoginPage } from './pages/Login'
import { DashboardPage } from './pages/Dashboard'
import { ReportsPage } from './pages/Reports'
import { UsersPage } from './pages/Users'
import { NotFoundPage } from './pages/NotFound'
import { AppLoginPage } from './pages/app/AppLogin'
import { RegisterPage } from './pages/app/Register'
import { ConsumerLayout } from './pages/app/AppLayout'
import { AppHomePage } from './pages/app/Home'
import { NewReportPage } from './pages/app/NewReport'
import { MePage } from './pages/app/Me'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route element={<RequireAdmin />}>
        <Route element={<AppLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="users" element={<UsersPage />} />
        </Route>
      </Route>

      <Route path="/app/login" element={<AppLoginPage />} />
      <Route path="/app/register" element={<RegisterPage />} />
      <Route element={<RequireConsumer />}>
        <Route path="/app" element={<ConsumerLayout />}>
          <Route index element={<AppHomePage />} />
          <Route path="report" element={<NewReportPage />} />
          <Route path="me" element={<MePage />} />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
