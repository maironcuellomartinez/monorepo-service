import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { authApi } from '../lib/api';

interface AuthUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: string[];
}

interface AuthContextType {
    user: AuthUser | null;
    token: string | null;
    permissions: string[];
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [token, setToken] = useState<string | null>(null);
    const [permissions, setPermissions] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Escuchar evento de 401 desde el interceptor de axios
    useEffect(() => {
        const handle = () => {
            setToken(null);
            setUser(null);
            setPermissions([]);
        };
        window.addEventListener('abac:unauthorized', handle);
        return () => window.removeEventListener('abac:unauthorized', handle);
    }, []);

    // Restaurar sesion desde sessionStorage
    useEffect(() => {
        const savedToken = sessionStorage.getItem('abac_token');
        const savedUser = sessionStorage.getItem('abac_user');
        const savedPermissions = sessionStorage.getItem('abac_permissions');
        if (savedToken && savedUser) {
            try {
                setToken(savedToken);
                setUser(JSON.parse(savedUser));
                setPermissions(savedPermissions ? JSON.parse(savedPermissions) : []);
            } catch {
                sessionStorage.removeItem('abac_token');
                sessionStorage.removeItem('abac_user');
                sessionStorage.removeItem('abac_permissions');
            }
        }
        setIsLoading(false);
    }, []);

    const login = useCallback(async (email: string, password: string) => {
        const { data } = await authApi.login(email, password);

        if (!data?.accessToken || !data?.user?.id) {
            throw new Error('Respuesta de autenticacion invalida');
        }

        const authUser: AuthUser = {
            id: data.user.id,
            email: data.user.email ?? '',
            firstName: data.user.firstName ?? '',
            lastName: data.user.lastName ?? '',
            roles: Array.isArray(data.user.roles) ? data.user.roles : [],
        };

        setToken(data.accessToken);
        setUser(authUser);
        setPermissions(data.permissions || []);

        sessionStorage.setItem('abac_token', data.accessToken);
        sessionStorage.setItem('abac_user', JSON.stringify(authUser));
        sessionStorage.setItem('abac_permissions', JSON.stringify(data.permissions || []));
    }, []);

    const logout = useCallback(() => {
        setToken(null);
        setUser(null);
        setPermissions([]);
        sessionStorage.removeItem('abac_token');
        sessionStorage.removeItem('abac_user');
        sessionStorage.removeItem('abac_permissions');
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                permissions,
                isAuthenticated: !!token,
                isLoading,
                login,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth debe usarse dentro de AuthProvider');
    }
    return context;
}
