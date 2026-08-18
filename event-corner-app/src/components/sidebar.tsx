import { useState, useEffect } from 'react'
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  AlertCircle,
  MapPin,
  Calendar,
  Tag,
  Users,
  ChevronLeft,
  ChevronRight,
  Building2,
  Cpu,
  PackagePlus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/auth'
import { Button } from '@/components/ui/button'

/**
 * permission:  permiso(s) ABAC requerido(s) para ver el item (OR si es array).
 * staffOnly:   true → oculto para empleados/clientes (solo técnicos, admins, managers).
 *              Los empleados gestionan sus incidencias desde el Dashboard.
 *
 * Lógica de visibilidad por rol:
 *  - Dashboard              → todos
 *  - Citas                  → solo técnicos/admins/managers (staffOnly)
 *  - Disponibilidad         → solo técnicos/admins/managers (staffOnly)
 *  - Corners                → admin y manager (schedule:create) — el CRUD de Corner
 *                             en sí queda gateado adentro de CornersPage (admin-only)
 *  - Usuarios               → admin (user:list) y manager (technician:list) — UsersPage
 *                             decide internamente qué tabs mostrar (Usuarios/Técnicos)
 *  - Tipos de Incidencia    → admin y manager (issue-type:create)
 *  - Compañías              → admin, manager y readonly (company:read) — employee/technician
 *                             tienen company:list (lookup interno del treeId en el wizard de
 *                             citas) pero no company:read, así que no ven este ítem
 */
const NAV_ITEMS: { to: string; icon: React.ElementType; label: string; permission?: string | string[]; staffOnly?: boolean }[] = [
  { to: '/dashboard',    icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/appointments', icon: AlertCircle,     label: 'Citas',               permission: 'appointment:list',      staffOnly: true },
  { to: '/appointments/batch', icon: PackagePlus, label: 'Lote de Citas',    permission: 'appointment:list',      staffOnly: true },
  { to: '/corners',      icon: MapPin,          label: 'Corners',             permission: 'schedule:create' },
  { to: '/users',        icon: Users,           label: 'Usuarios',            permission: ['user:list', 'technician:list'] },
  { to: '/availability', icon: Calendar,        label: 'Disponibilidad',      permission: 'availability:read',     staffOnly: true },
  { to: '/issue-types',  icon: Tag,             label: 'Tipos de Citas',      permission: 'issue-type:create' },
  { to: '/companies',    icon: Building2,       label: 'Compañías',           permission: 'company:read' },
  { to: '/devices',      icon: Cpu,             label: 'Dispositivos',         permission: 'user:list' },
]

export function Sidebar() {
  const { user, can } = useAuth()
  // Employees manage incidents from the Dashboard — they don't need staff-only pages.
  // appointment:list-all (no lo tiene employee) distingue staff (admin/manager/technician)
  // de un empleado común — corner:manage-schedules no sirve porque manager tampoco lo tiene.
  const isEmployee = !user?.technicianId && can('appointment:create') && !can('appointment:list-all')
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem('ec_sidebar') === 'collapsed'
  })

  useEffect(() => {
    localStorage.setItem('ec_sidebar', collapsed ? 'collapsed' : 'expanded')
  }, [collapsed])

  return (
    <aside
      className={cn(
        'flex flex-col h-screen bg-card border-r border-border transition-all duration-300 sticky top-0',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 py-4 border-b border-border min-h-[60px]">
        <div className="flex-shrink-0 w-8 h-8 rounded-md bg-primary flex items-center justify-center">
          <Building2 className="w-4 h-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-sm font-semibold truncate">Event Corner</p>
            <p className="text-xs text-muted-foreground truncate">Service Desk</p>
          </div>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-2 overflow-y-auto">
        {NAV_ITEMS.filter(({ permission, staffOnly }) => {
          const hasPermission = !permission || (Array.isArray(permission) ? permission.some(can) : can(permission))
          return hasPermission && (!staffOnly || !isEmployee)
        }).map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-3 py-2 mx-1 my-0.5 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )
            }
            title={collapsed ? label : undefined}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* User info + logout */}
      <div className="border-t border-border p-2">
        {!collapsed && user && (
          <div className="px-2 py-1 mb-1">
            <p className="text-xs font-medium truncate">{user.name || user.email}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        )}
        <div className={cn('flex', collapsed ? 'flex-col gap-1' : 'gap-1')}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((c) => !c)}
            className="h-8 w-8"
            title={collapsed ? 'Expandir' : 'Colapsar'}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </aside>
  )
}
