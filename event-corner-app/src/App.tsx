import React from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/context/auth'
import { ThemeProvider } from '@/components/theme-provider'
import { Sidebar } from '@/components/sidebar'
import { LoginPage } from '@/pages/login-page'
import { DashboardPage } from '@/pages/dashboard-page'
import { IncidentsPage } from '@/pages/incidents-page'
import { CreateIncidentPage } from '@/pages/create-incident-page'
import { IncidentDetailPage } from '@/pages/incident-detail-page'
import { RequestsPage } from '@/pages/requests-page'
import { CreateRequestPage } from '@/pages/create-request-page'
import { CornersPage } from '@/pages/corners-page'
import { AvailabilityPage } from '@/pages/availability-page'
import { IssueTypesPage } from '@/pages/issue-types-page'
import { CompaniesPage } from '@/pages/companies-page'
import { UsersPage } from '@/pages/users-page'
import { DevicesPage } from '@/pages/devices-page'
import { BatchIncidentPage } from '@/pages/batch-incident-page'

// ── Protected Layout ─────────────────────────────────────────────────────────

function ProtectedLayout() {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        <Outlet />
      </main>
    </div>
  )
}

// ── Permission Route ─────────────────────────────────────────────────────────
// Redirige al dashboard si el usuario no tiene el permiso requerido.

function PermissionRoute({ permission, children }: { permission: string; children: React.ReactNode }) {
  const { can } = useAuth()
  if (!can(permission)) {
    return <Navigate to="/dashboard" replace />
  }
  return <>{children}</>
}

// ── Error Boundary ───────────────────────────────────────────────────────────

interface ErrorBoundaryState {
  hasError: boolean
  error?: Error
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-screen p-8">
          <div className="text-center max-w-md">
            <h2 className="text-xl font-semibold mb-2">Algo salió mal</h2>
            <p className="text-muted-foreground text-sm mb-4">
              {this.state.error?.message ?? 'Error inesperado'}
            </p>
            <button
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
              onClick={() => {
                this.setState({ hasError: false, error: undefined })
                window.location.href = '/dashboard'
              }}
            >
              Volver al inicio
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ── App ──────────────────────────────────────────────────────────────────────

function AppRoutes() {
  const { isAuthenticated } = useAuth()

  return (
    <Routes>
      <Route
        path="/login"
        element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />}
      />
      <Route element={<ProtectedLayout />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/incidents" element={
          <PermissionRoute permission="incident:list"><IncidentsPage /></PermissionRoute>
        } />
        {/* /incidents/new and /incidents/:id are accessible to any authenticated user
            (employees reach them from the Dashboard; technicians from the Incidents page) */}
        <Route path="/incidents/new" element={<CreateIncidentPage />} />
        <Route path="/incidents/batch" element={<BatchIncidentPage />} />
        <Route path="/incidents/:id" element={<IncidentDetailPage />} />
        <Route path="/requests" element={
          <PermissionRoute permission="request:list"><RequestsPage /></PermissionRoute>
        } />
        <Route path="/requests/new" element={<CreateRequestPage />} />
        {/* schedule:create: lo tienen admin y manager (corner CRUD queda gateado
            adentro de CornersPage con corner:create/update/delete, admin-only) */}
        <Route path="/corners" element={
          <PermissionRoute permission="schedule:create"><CornersPage /></PermissionRoute>
        } />
        <Route path="/availability" element={
          <PermissionRoute permission="availability:read"><AvailabilityPage /></PermissionRoute>
        } />
        <Route path="/issue-types" element={
          <PermissionRoute permission="issue-type:create"><IssueTypesPage /></PermissionRoute>
        } />
        <Route path="/companies" element={
          <PermissionRoute permission="company:list"><CompaniesPage /></PermissionRoute>
        } />
        <Route path="/users" element={
          <PermissionRoute permission="user:list"><UsersPage /></PermissionRoute>
        } />
        {/* technician:list: lo tienen admin y manager. UsersPage decide internamente
            qué tabs mostrar según can('user:list') / can('technician:list') */}
        <Route path="/technicians" element={
          <PermissionRoute permission="technician:list"><UsersPage /></PermissionRoute>
        } />
        <Route path="/devices" element={
          <PermissionRoute permission="user:list"><DevicesPage /></PermissionRoute>
        } />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" storageKey="ec-theme">
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}
