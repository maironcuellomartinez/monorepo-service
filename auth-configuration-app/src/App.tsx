import { useState, Component, type ReactNode } from "react"
import { Routes, Route, Navigate } from "react-router-dom"
import { LoginForm } from "./components/login-form"
import { Sidebar } from "./components/sidebar"
import { Header } from "./components/header"
import { DashboardOverview } from "./components/dashboard-overview"
import { UsersPage } from "./components/users-page"
import { RolesPage } from "./components/roles-page"
import { PermissionsPage } from "./components/permissions-page"
import { ApplicationsPage } from "./components/applications-page"
import { PoliciesPage } from "./components/policies-page"
import { ThemeProvider } from "./components/theme-provider"
import { AuthProvider, useAuth } from "./contexts/auth-context"

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() { return { hasError: true } }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <div className="text-center space-y-2">
            <p className="text-lg font-semibold">Ocurrió un error inesperado</p>
            <button className="text-sm text-primary underline" onClick={() => this.setState({ hasError: false })}>
              Reintentar
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

function AppRoutes() {
  const { isAuthenticated, isLoading, logout } = useAuth()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebar_collapsed') !== 'false'
  )

  const toggleSidebar = () => setSidebarCollapsed(prev => {
    const next = !prev
    localStorage.setItem('sidebar_collapsed', String(next))
    return next
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <LoginForm />
      </div>
    )
  }

  return (
    <div className="flex h-screen bg-background">
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header onLogout={logout} />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-background">
          <div className="container mx-auto px-6 py-8">
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<DashboardOverview />} />
              <Route path="/users" element={<UsersPage />} />
              <Route path="/roles" element={<RolesPage />} />
              <Route path="/permissions" element={<PermissionsPage />} />
              <Route path="/applications" element={<ApplicationsPage />} />
              <Route path="/policies" element={<PoliciesPage />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" storageKey="ui-theme">
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
