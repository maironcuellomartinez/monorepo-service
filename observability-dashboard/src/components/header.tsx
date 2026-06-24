import { useTheme } from "./theme-provider"
import { Moon, Sun, RefreshCw } from "lucide-react"
import { Button } from "./ui/button"

interface HeaderProps {
  title: string
  onRefresh?: () => void
  refreshing?: boolean
}

export function Header({ title, onRefresh, refreshing }: HeaderProps) {
  const { theme, setTheme } = useTheme()

  return (
    <header className="bg-background border-b border-border py-4 px-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-foreground">{title}</h2>
        <div className="flex items-center space-x-2">
          {onRefresh && (
            <Button variant="ghost" size="icon" onClick={onRefresh} disabled={refreshing} title="Actualizar">
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            <span className="sr-only">Toggle theme</span>
          </Button>
        </div>
      </div>
    </header>
  )
}
