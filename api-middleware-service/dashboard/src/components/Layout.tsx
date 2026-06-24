import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  KeyRound,
  ClipboardList,
  FileSearch,
  HeartPulse,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { logoutAdmin } from '../lib/api';
import OAuthTokenPanel from './OAuthTokenPanel';
import { useTheme } from '../hooks/useTheme';

const navItems: { to: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/clients', label: 'Clients', icon: KeyRound },
  { to: '/records', label: 'Records', icon: ClipboardList },
  { to: '/issues', label: 'Issues', icon: FileSearch },
  { to: '/health', label: 'Health', icon: HeartPulse },
];

export default function Layout() {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();

  const handleLogout = async () => {
    try {
      await logoutAdmin();
    } catch {
      // Ignore errors — navigate to login anyway
    }
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar fijo colapsable */}
      <aside
        className={`fixed left-0 top-0 h-full z-30 flex flex-col bg-gray-900 text-white transition-all duration-300 ${
          expanded ? 'w-64' : 'w-16'
        }`}
      >
        {/* Header con título + toggle */}
        <div className={`flex items-center h-16 px-2 mb-1 ${expanded ? 'justify-between px-4' : 'justify-center'}`}>
          {expanded && (
            <div>
              <h1 className="text-sm font-bold leading-tight">API Middleware</h1>
              <p className="text-xs text-gray-400">OAuth2 Admin</p>
            </div>
          )}
          <button
            onClick={() => setExpanded((prev) => !prev)}
            className="p-1 rounded hover:bg-gray-700 text-gray-300 hover:text-white transition-colors"
            title={expanded ? 'Colapsar' : 'Expandir'}
          >
            {expanded
              ? <ChevronLeft className="h-5 w-5" />
              : <ChevronRight className="h-5 w-5" />
            }
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.exact ?? false}
                className={({ isActive }) =>
                  `flex items-center gap-3 py-2 px-3 rounded transition duration-150 hover:bg-gray-700 ${
                    isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:text-white'
                  } ${!expanded ? 'justify-center' : ''}`
                }
                title={!expanded ? item.label : undefined}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {expanded && <span className="text-sm truncate">{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        {/* OAuthTokenPanel — visible solo cuando expandido */}
        <div
          className={`transition-all duration-300 overflow-hidden ${
            expanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="px-3 py-2 border-t border-white/10">
            <OAuthTokenPanel />
          </div>
        </div>
      </aside>

      {/* Main content area */}
      <div
        className={`flex flex-col flex-1 min-w-0 transition-all duration-300 ${
          expanded ? 'ml-64' : 'ml-16'
        }`}
      >
        <header className="flex items-center justify-between h-16 px-4 border-b bg-card lg:px-6">
          <div className="flex-1" />
          <div className="flex items-center gap-1">
            <button
              onClick={toggle}
              className="p-2 text-muted-foreground rounded-md hover:bg-accent hover:text-foreground transition-colors"
              title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-muted-foreground rounded-md hover:bg-accent hover:text-foreground transition-colors"
              title="Cerrar sesión"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
