"use client"

import { createContext, SetStateAction, useContext, useEffect, useState } from "react"

const ThemeProviderContext = createContext<{
    theme: string;
    setTheme: (theme: SetStateAction<string>) => void;
}>({
    theme: "system",
    setTheme: () => { }
})

import { ReactNode } from "react";

export function ThemeProvider({ children, defaultTheme = "system", storageKey = "ui-theme", ...props }: { children: ReactNode, defaultTheme?: string, storageKey?: string }) {
    const [theme, setTheme] = useState(() => localStorage.getItem(storageKey) || defaultTheme)

    useEffect(() => {
        const root = window.document.documentElement

        root.classList.remove("light", "dark")

        if (theme === "system") {
            const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"

            root.classList.add(systemTheme)
            return
        }

        root.classList.add(theme)
    }, [theme])

    const value = {
        theme,
        setTheme: (theme: SetStateAction<string>) => {
            const newTheme = typeof theme === 'function' ? theme(localStorage.getItem(storageKey) || defaultTheme) : theme;
            localStorage.setItem(storageKey, newTheme)
            setTheme(newTheme)
        },
    }

    return (
        <ThemeProviderContext.Provider {...props} value={value}>
            {children}
        </ThemeProviderContext.Provider>
    )
}

export const useTheme = () => {
    const context = useContext(ThemeProviderContext)

    if (context === undefined) throw new Error("useTheme must be used within a ThemeProvider")

    return context
}

