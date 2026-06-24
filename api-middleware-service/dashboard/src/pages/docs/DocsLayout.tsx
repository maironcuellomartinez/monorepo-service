import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Compass, Layers, Activity, ShieldCheck, Rocket } from 'lucide-react';

const navLinks = [
  { to: '/docs', label: 'Vision General', end: true,         icon: Compass },
  { to: '/docs/arquitectura', label: 'Arquitectura', end: false, icon: Layers },
  { to: '/docs/resiliencia',  label: 'Resiliencia',  end: false, icon: Activity },
  { to: '/docs/seguridad',    label: 'Seguridad',    end: false, icon: ShieldCheck },
  { to: '/docs/despliegue',   label: 'Despliegue',   end: false, icon: Rocket },
] as const;

export default function DocsLayout() {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          'relative shrink-0 border-r bg-card transition-all duration-300 ease-in-out',
          collapsed ? 'w-12' : 'w-64'
        )}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div
            className={cn(
              'flex items-center px-2 py-5 transition-all duration-300',
              collapsed ? 'justify-center' : 'justify-between px-4'
            )}
          >
            {!collapsed && (
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Documentacion</h2>
                <p className="text-xs text-muted-foreground">API Middleware Service</p>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
            </Button>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 px-1">
            <nav className="space-y-1">
              {navLinks.map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  end={link.end}
                  title={collapsed ? link.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium transition-colors',
                      collapsed ? 'justify-center' : 'px-3',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )
                  }
                >
                  <link.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{link.label}</span>}
                </NavLink>
              ))}
            </nav>
          </ScrollArea>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-8">
        <div className="mx-auto max-w-4xl">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
