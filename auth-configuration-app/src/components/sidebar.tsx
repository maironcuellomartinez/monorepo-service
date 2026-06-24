import { Link, useLocation } from "react-router-dom"
import { Home, Users, Shield, Key, AppWindow, FileText, ChevronLeft, ChevronRight, type LucideIcon } from "lucide-react"

interface SidebarProps {
    collapsed: boolean
    onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
    return (
        <div
            className={`bg-gray-800 text-white flex flex-col py-7 px-2 transition-all duration-300 hidden md:flex ${collapsed ? "w-16" : "w-64"
                }`}
        >
            {/* Header */}
            <div className={`mb-6 flex items-center ${collapsed ? "justify-center px-0" : "justify-between px-2"}`}>
                {!collapsed && (
                    <div>
                        <h1 className="text-lg font-bold">ABAC Admin</h1>
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

            {/* Nav */}
            <nav className="space-y-1 flex-1">
                <SidebarLink icon={Home} label="Dashboard" to="/dashboard" collapsed={collapsed} />
                <SidebarLink icon={Users} label="Usuarios" to="/users" collapsed={collapsed} />
                <SidebarLink icon={Shield} label="Roles" to="/roles" collapsed={collapsed} />
                <SidebarLink icon={Key} label="Permisos" to="/permissions" collapsed={collapsed} />
                <SidebarLink icon={AppWindow} label="Aplicaciones" to="/applications" collapsed={collapsed} />
                <SidebarLink icon={FileText} label="Politicas" to="/policies" collapsed={collapsed} />
            </nav>
        </div>
    )
}

function SidebarLink({
    icon: Icon,
    label,
    to,
    collapsed,
}: {
    icon: LucideIcon
    label: string
    to: string
    collapsed: boolean
}) {
    const location = useLocation()
    const isActive = location.pathname === to

    return (
        <Link
            to={to}
            title={collapsed ? label : undefined}
            className={`flex items-center gap-3 py-2.5 px-3 rounded transition duration-200 hover:bg-gray-700 ${isActive ? "bg-gray-700 text-white" : "text-gray-300"
                } ${collapsed ? "justify-center" : ""}`}
        >
            <Icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span className="text-sm truncate">{label}</span>}
        </Link>
    )
}
