import { useTheme } from "./theme-provider"
import { useAuth } from "../contexts/auth-context"
import { LogOut, Moon, Sun } from "lucide-react"
import { Button } from "./ui/button"

interface HeaderProps {
    onLogout: () => void;
}

export function Header({ onLogout }: HeaderProps) {
    const { theme, setTheme } = useTheme()
    const { user } = useAuth()

    const toggleTheme = () => {
        setTheme(theme === "dark" ? "light" : "dark")
    }

    return (
        <header className="bg-background shadow-md py-4 px-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-foreground">ABAC Admin Panel</h2>
                <div className="flex items-center space-x-3">
                    {user && (
                        <span className="text-sm text-muted-foreground">
                            {user.email}
                        </span>
                    )}
                    <Button variant="ghost" size="icon" onClick={toggleTheme}>
                        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                        <span className="sr-only">Toggle theme</span>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={onLogout}>
                        <LogOut className="h-5 w-5" />
                        <span className="sr-only">Logout</span>
                    </Button>
                </div>
            </div>
        </header>
    )
}
