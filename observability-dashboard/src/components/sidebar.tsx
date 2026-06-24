import { Link, useLocation } from "react-router-dom"
import {
  LayoutDashboard,
  ScrollText,
  GitBranch,
  BarChart2,
  Link2,
  Bell,
  Settings,
  HeartPulse,
  TrendingUp,
  CalendarClock,
  Target,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react"

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <div
      className={`bg-gray-900 text-white flex flex-col py-7 px-2 transition-all duration-300 hidden md:flex shrink-0 ${
        collapsed ? "w-16" : "w-64"
      }`}
    >
      {/* Header */}
      <div className={`mb-5 flex items-center ${collapsed ? "justify-center px-0" : "justify-between px-2"}`}>
        {!collapsed && (
          <div>
            <h1 className="text-lg font-bold">Observability</h1>
            <p className="text-xs text-gray-400">Event Corner v3</p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
          title={collapsed ? "Expandir" : "Colapsar"}
        >
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>

      <nav className="space-y-0.5 flex-1 overflow-y-auto">
        {/* Exploración */}
        <SectionLabel label="Exploración" collapsed={collapsed} />
        <SidebarLink icon={LayoutDashboard} label="Overview"    to="/"            collapsed={collapsed} exact />
        <SidebarLink icon={ScrollText}     label="Logs"         to="/logs"         collapsed={collapsed} />
        <SidebarLink icon={GitBranch}      label="Traces"       to="/traces"       collapsed={collapsed} />
        <SidebarLink icon={BarChart2}      label="Métricas"     to="/metrics"      collapsed={collapsed} />
        <SidebarLink icon={Link2}          label="Correlación"  to="/correlation"  collapsed={collapsed} />

        {/* Análisis */}
        <SectionLabel label="Análisis" collapsed={collapsed} />
        <SidebarLink icon={HeartPulse}    label="Health"       to="/health"       collapsed={collapsed} />
        <SidebarLink icon={TrendingUp}    label="Top-N"        to="/topn"         collapsed={collapsed} />
        <SidebarLink icon={CalendarClock} label="Timeline"     to="/timeline"     collapsed={collapsed} />
        <SidebarLink icon={Target}        label="SLO"          to="/slo"          collapsed={collapsed} />

        {/* Alertas */}
        <SectionLabel label="Alertas" collapsed={collapsed} />
        <SidebarLink icon={Bell} label="Alertas" to="/alerts" collapsed={collapsed} />
      </nav>

      {/* Config al fondo */}
      <div className="border-t border-gray-700 pt-2 mt-2">
        <SidebarLink icon={Settings} label="Configuración" to="/settings" collapsed={collapsed} />
      </div>
    </div>
  )
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return <div className="my-1.5 border-t border-gray-700" />
  return (
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3 pt-3 pb-1">
      {label}
    </p>
  )
}

function SidebarLink({
  icon: Icon,
  label,
  to,
  collapsed,
  exact,
}: {
  icon: LucideIcon
  label: string
  to: string
  collapsed: boolean
  exact?: boolean
}) {
  const location = useLocation()
  const isActive = exact ? location.pathname === to : location.pathname.startsWith(to)

  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 py-2 px-3 rounded transition duration-150 hover:bg-gray-700 ${
        isActive ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"
      } ${collapsed ? "justify-center" : ""}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="text-sm truncate">{label}</span>}
    </Link>
  )
}
