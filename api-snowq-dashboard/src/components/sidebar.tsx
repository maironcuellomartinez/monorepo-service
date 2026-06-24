import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  List,
  CircuitBoard,
  Bell,
  History,
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  type LucideIcon,
} from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Cola', href: '/queue', icon: List },
  { name: 'DLQ', href: '/dlq', icon: AlertTriangle },
  { name: 'Circuit Breaker', href: '/circuit-breaker', icon: CircuitBoard },
  { name: 'Monitoreo', href: '/monitoring', icon: Bell },
  { name: 'Historial', href: '/history', icon: History },
  { name: 'Salud', href: '/health', icon: Activity },
];

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location = useLocation();

  return (
    <div
      className={`bg-gray-900 text-white flex flex-col py-7 px-2 transition-all duration-300 hidden md:flex shrink-0 ${
        collapsed ? 'w-16' : 'w-64'
      }`}
    >
      {/* Header */}
      <div className={`mb-5 flex items-center ${collapsed ? 'justify-center px-0' : 'justify-between px-2'}`}>
        {!collapsed && (
          <div>
            <h1 className="text-lg font-bold">api-snowq</h1>
            <p className="text-xs text-gray-400">Dashboard v1.0</p>
          </div>
        )}
        <button
          onClick={onToggle}
          className="p-1 rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="space-y-0.5 flex-1 overflow-y-auto">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <SidebarLink
              key={item.name}
              icon={item.icon}
              label={item.name}
              to={item.href}
              collapsed={collapsed}
              isActive={isActive}
            />
          );
        })}
      </nav>

      {/* Config at the bottom */}
      <div className="border-t border-gray-700 pt-2 mt-2">
        <SidebarLink
          icon={Settings}
          label="Configuración"
          to="/settings"
          collapsed={collapsed}
          isActive={location.pathname === '/settings'}
        />
      </div>
    </div>
  );
}

function SidebarLink({
  icon: Icon,
  label,
  to,
  collapsed,
  isActive,
}: {
  icon: LucideIcon;
  label: string;
  to: string;
  collapsed: boolean;
  isActive: boolean;
}) {
  return (
    <Link
      to={to}
      title={collapsed ? label : undefined}
      className={`flex items-center gap-3 py-2 px-3 rounded transition duration-150 hover:bg-gray-700 ${
        isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
      } ${collapsed ? 'justify-center' : ''}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed && <span className="text-sm truncate">{label}</span>}
    </Link>
  );
}
