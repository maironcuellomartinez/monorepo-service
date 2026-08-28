import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi, resetUnauthorizedGuard } from '@/lib/api'

interface AuthUser {
  email: string
  oid: string
  name?: string
  upn?: string | null
  customerId: string
  companyId: string | null
  micornerUserId: string
  abacUserId?: string
  /** Presente solo si el usuario es técnico y ya tiene corner asignado */
  technicianId: string | null
  /** Permisos ABAC en formato "resource:action" — fuente: /api/auth/me */
  permissions: string[]
}

interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  /** Verifica si el usuario tiene el permiso especificado ("resource:action") */
  can: (permission: string) => boolean
  login: (email: string, oid: string, name: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try {
      const raw = sessionStorage.getItem('ec_user')
      if (!raw) return null
      const parsed = JSON.parse(raw) as AuthUser
      // Si la sesión no tiene el campo permissions (sesión anterior al feature),
      // invalidar para forzar un re-login y obtener permisos frescos.
      if (!Array.isArray(parsed.permissions)) {
        sessionStorage.removeItem('ec_user')
        sessionStorage.removeItem('ec_token')
        return null
      }
      return parsed
    } catch {
      return null
    }
  })

  const logout = useCallback(() => {
    sessionStorage.removeItem('ec_token')
    sessionStorage.removeItem('ec_user')
    setUser(null)
  }, [])

  const login = useCallback(async (email: string, oid: string, name: string) => {
    // Reset the 401 guard so a new session can trigger logout if needed
    resetUnauthorizedGuard()

    // 1. Build dev token and store it so apiClient interceptor can attach it
    const token = authApi.buildDevToken(oid, email, name)
    sessionStorage.setItem('ec_token', token)

    // 2. Call /api/auth/me — gateway validates token, syncs user with monolith
    const me = await authApi.me()

    // 3. Persist full user profile (permissions vienen del JWT validado por ABAC)
    const userData: AuthUser = {
      email,
      oid,
      name: name || email,
      upn: me.upn,
      micornerUserId: me.micornerUserId,
      abacUserId: me.abacUserId,
      customerId: me.micornerUserId,
      companyId: me.companyId,
      technicianId: me.technicianId ?? null,
      permissions: me.permissions ?? [],
    }
    sessionStorage.setItem('ec_user', JSON.stringify(userData))
    setUser(userData)
  }, [])

  const can = useCallback(
    (permission: string): boolean => {
      return user?.permissions?.includes(permission) ?? false
    },
    [user],
  )

  useEffect(() => {
    const handler = () => logout()
    window.addEventListener('ec:unauthorized', handler)
    return () => window.removeEventListener('ec:unauthorized', handler)
  }, [logout])

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, can, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
