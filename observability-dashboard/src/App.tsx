import { useState, Component, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './components/theme-provider'
import { ConfigProvider } from './contexts/config-context'
import { Sidebar } from './components/sidebar'
import { OverviewPage }     from './pages/overview-page'
import { LogsPage }         from './pages/logs-page'
import { TracesPage }       from './pages/traces-page'
import { MetricsPage }      from './pages/metrics-page'
import { CorrelationPage }  from './pages/correlation-page'
import { AlertsPage }       from './pages/alerts-page'
import { SettingsPage }     from './pages/settings-page'
import { HealthPage }       from './pages/health-page'
import { TopNPage }         from './pages/topn-page'
import { TimelinePage }     from './pages/timeline-page'
import { SloPage }          from './pages/slo-page'

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

function AppLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem('obs_sidebar_collapsed') === 'true',
  )

  const toggleSidebar = () => setSidebarCollapsed(prev => {
    const next = !prev
    localStorage.setItem('obs_sidebar_collapsed', String(next))
    return next
  })

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/"            element={<OverviewPage />}    />
            <Route path="/logs"        element={<LogsPage />}         />
            <Route path="/traces"      element={<TracesPage />}       />
            <Route path="/metrics"     element={<MetricsPage />}      />
            <Route path="/correlation" element={<CorrelationPage />}  />
            <Route path="/alerts"      element={<AlertsPage />}       />
            <Route path="/health"      element={<HealthPage />}       />
            <Route path="/topn"        element={<TopNPage />}         />
            <Route path="/timeline"    element={<TimelinePage />}     />
            <Route path="/slo"         element={<SloPage />}          />
            <Route path="/settings"    element={<SettingsPage />}     />
            <Route path="*"            element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system" storageKey="obs-ui-theme">
        <ConfigProvider>
          <AppLayout />
        </ConfigProvider>
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App
