import { useNavigate } from 'react-router-dom'
import { RefreshCw, Moon, Sun, LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTheme } from '@/components/theme-provider'
import { useAuth } from '@/context/auth'
import { cn } from '@/lib/utils'

interface HeaderProps {
  title: string
  icon?: React.ElementType
  onRefresh?: () => void
  loading?: boolean
  children?: React.ReactNode
}

export function Header({ title, icon: Icon, onRefresh, loading = false, children }: HeaderProps) {
  const { theme, setTheme } = useTheme()
  const { logout, user } = useAuth()
  const navigate = useNavigate()

  const toggleTheme = () => {
    if (theme === 'dark') setTheme('light')
    else setTheme('dark')
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="sticky top-0 z-10 flex items-center justify-between h-14 px-6 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-5 h-5 text-muted-foreground" />}
        <h1 className="text-lg font-semibold">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        {children}
        {onRefresh && (
          <Button variant="outline" size="icon" onClick={onRefresh} disabled={loading} title="Actualizar">
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>
        )}
        {user?.upn && (
          <span className="text-xs text-muted-foreground hidden sm:inline" title="UPN">
            {user.upn}
          </span>
        )}
        <Button variant="ghost" size="icon" onClick={toggleTheme} title="Cambiar tema">
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="text-muted-foreground hover:text-destructive"
          title="Cerrar sesión"
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  )
}
