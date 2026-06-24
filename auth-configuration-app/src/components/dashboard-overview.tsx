import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card"
import { Badge } from "./ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { useAuth } from "../contexts/auth-context"
import { usersApi, rolesApi, applicationsApi, permissionsApi, auditApi } from "../lib/api"
import { Users, Shield, Key, AppWindow, LogIn, AlertTriangle, Ban, Activity, CheckCircle2, XCircle } from "lucide-react"

interface AuditStats {
    today: {
        logins: number
        failedLogins: number
        accessDenied: number
        crudOps: number
    }
    last7days: {
        activeUsers: number
        dailyActivity: { date: string; total: string | number; logins: string | number; denied: string | number }[]
        topUsers: { email: string; count: string | number }[]
        actionBreakdown: { action: string; count: string | number }[]
    }
}

interface RecentEntry {
    id: string
    action: string
    entityType: string | null
    userId: string | null
    userEmail: string | null
    description: string | null
    isSuccess: boolean
    createdAt: string
}

const ACTION_COLORS: Record<string, string> = {
    LOGIN: "bg-green-100 text-green-800",
    LOGIN_FAILED: "bg-red-100 text-red-800",
    ACCESS_DENIED: "bg-orange-100 text-orange-800",
    CREATE: "bg-blue-100 text-blue-800",
    UPDATE: "bg-yellow-100 text-yellow-800",
    DELETE: "bg-red-100 text-red-800",
    DEACTIVATE: "bg-gray-100 text-gray-800",
    REACTIVATE: "bg-green-100 text-green-800",
    LOGOUT: "bg-gray-100 text-gray-800",
}

function formatDate(iso: string) {
    try {
        return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })
    } catch {
        return new Date(iso).toLocaleString()
    }
}

function formatDay(dateStr: string) {
    const d = new Date(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00')
    try {
        return d.toLocaleDateString('ar-AR', { weekday: 'short', day: 'numeric', month: 'short' })
    } catch {
        return d.toLocaleDateString()
    }
}

interface Application {
    id: string
    name: string
    type: string
}

export function DashboardOverview() {
    const { user } = useAuth()
    const [counts, setCounts] = useState({ users: 0, roles: 0, permissions: 0, applications: 0 })
    const [auditStats, setAuditStats] = useState<AuditStats | null>(null)
    const [recentActivity, setRecentActivity] = useState<RecentEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [auditLoading, setAuditLoading] = useState(false)
    const [applications, setApplications] = useState<Application[]>([])
    const [selectedAppId, setSelectedAppId] = useState<string>('all')

    // Load entity counts and applications list once
    useEffect(() => {
        const load = async () => {
            try {
                const [usersRes, rolesRes, permsRes, appsRes] = await Promise.all([
                    usersApi.list({ limit: 1 }),
                    rolesApi.list(),
                    permissionsApi.list(),
                    applicationsApi.list(),
                ])
                setCounts({
                    users: usersRes.data.total || 0,
                    roles: Array.isArray(rolesRes.data) ? rolesRes.data.length : (rolesRes.data.total ?? rolesRes.data.roles?.length ?? 0),
                    permissions: Array.isArray(permsRes.data) ? permsRes.data.length : (permsRes.data.permissions?.length || 0),
                    applications: Array.isArray(appsRes.data) ? appsRes.data.length : (appsRes.data.applications?.length || 0),
                })
                const appsData = Array.isArray(appsRes.data) ? appsRes.data : (appsRes.data.applications || [])
                setApplications(appsData)
            } catch (err) { console.error('Error cargando datos del dashboard:', err) }
        }
        load()
    }, [])

    // Load audit stats when selectedAppId changes
    useEffect(() => {
        const loadAudit = async () => {
            setAuditLoading(true)
            try {
                const appId = selectedAppId === 'all' ? undefined : selectedAppId
                console.log('appId ::', appId);
                const [statsRes, recentRes] = await Promise.all([
                    auditApi.getStats(appId),
                    auditApi.getRecent(10, appId),
                ])
                setAuditStats(statsRes.data)
                setRecentActivity(Array.isArray(recentRes.data) ? recentRes.data : [])
            } catch (err) { console.error('Error cargando datos del dashboard:', err) } finally {
                setAuditLoading(false)
                setLoading(false)
            }
        }
        loadAudit()
    }, [selectedAppId])

    const entityCards = [
        { label: "Usuarios", value: counts.users, icon: Users, color: "text-blue-600" },
        { label: "Roles", value: counts.roles, icon: Shield, color: "text-green-600" },
        { label: "Permisos", value: counts.permissions, icon: Key, color: "text-yellow-600" },
        { label: "Aplicaciones", value: counts.applications, icon: AppWindow, color: "text-purple-600" },
    ]

    const isAuditLoading = loading || auditLoading

    const todayCards = auditStats ? [
        { label: "Logins hoy", value: auditStats.today.logins, icon: LogIn, color: "text-green-600", bg: "bg-green-50" },
        { label: "Logins fallidos", value: auditStats.today.failedLogins, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50" },
        { label: "Accesos denegados", value: auditStats.today.accessDenied, icon: Ban, color: "text-orange-600", bg: "bg-orange-50" },
        { label: "Operaciones CRUD", value: auditStats.today.crudOps, icon: Activity, color: "text-blue-600", bg: "bg-blue-50" },
    ] : []

    const maxDailyTotal = auditStats
        ? Math.max(...auditStats.last7days.dailyActivity.map(d => Number(d.total) || 0), 1)
        : 1

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-bold">Dashboard</h1>
                <p className="text-muted-foreground">
                    Bienvenido, {user?.firstName} {user?.lastName} ({user?.roles?.join(', ')})
                </p>
            </div>

            {/* Entity counts */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {entityCards.map((card) => (
                    <Card key={card.label}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
                            <card.icon className={`h-5 w-5 ${card.color}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold">{loading ? "—" : card.value}</div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Today KPIs */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-semibold">Actividad de hoy</h2>
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-muted-foreground">Filtrar por aplicación:</span>
                        <Select value={selectedAppId} onValueChange={setSelectedAppId}>
                            <SelectTrigger className="w-52 h-8 text-sm">
                                <SelectValue placeholder="Todas las apps" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las aplicaciones</SelectItem>
                                {applications.map(app => (
                                    <SelectItem key={app.id} value={app.id}>
                                        {app.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {isAuditLoading ? (
                        Array.from({ length: 4 }).map((_, i) => (
                            <Card key={i}><CardContent className="pt-6"><div className="text-3xl font-bold text-muted-foreground">—</div></CardContent></Card>
                        ))
                    ) : todayCards.map((card) => (
                        <Card key={card.label} className={card.bg}>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium">{card.label}</CardTitle>
                                <card.icon className={`h-5 w-5 ${card.color}`} />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">{card.value}</div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>

            {/* Recent activity — full width */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Actividad reciente</CardTitle>
                </CardHeader>
                <CardContent>
                    {isAuditLoading ? (
                        <div className="text-center text-muted-foreground py-8">Cargando...</div>
                    ) : recentActivity.length === 0 ? (
                        <div className="text-center text-muted-foreground py-8">Sin actividad</div>
                    ) : (
                        <div className="divide-y">
                            {recentActivity.map((entry) => (
                                <div key={entry.id} className="flex items-center gap-4 py-2 text-sm">
                                    <div className="shrink-0">
                                        {entry.isSuccess
                                            ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                                            : <XCircle className="h-4 w-4 text-red-500" />
                                        }
                                    </div>
                                    <div className="flex items-center gap-2 w-52 shrink-0">
                                        <Badge className={`text-xs font-mono ${ACTION_COLORS[entry.action] || 'bg-gray-100 text-gray-800'}`}>
                                            {entry.action}
                                        </Badge>
                                        {entry.entityType && (
                                            <span className="text-xs text-muted-foreground">{entry.entityType}</span>
                                        )}
                                    </div>
                                    <span className="flex-1 text-muted-foreground truncate" title={entry.description ?? ''}>
                                        {entry.description || '—'}
                                    </span>
                                    <span className="w-48 shrink-0 truncate text-muted-foreground text-xs" title={entry.userEmail ?? entry.userId ?? ''}>
                                        {entry.userEmail || entry.userId || '—'}
                                    </span>
                                    <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
                                        {formatDate(entry.createdAt)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Daily activity chart (last 7 days) */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base">
                            Actividad últimos 7 días
                            {auditStats && (
                                <span className="ml-2 text-sm font-normal text-muted-foreground">
                                    {auditStats.last7days.activeUsers} usuarios activos
                                </span>
                            )}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isAuditLoading || !auditStats ? (
                            <div className="text-center text-muted-foreground py-8">Cargando...</div>
                        ) : auditStats.last7days.dailyActivity.length === 0 ? (
                            <div className="text-center text-muted-foreground py-8">Sin actividad</div>
                        ) : (
                            <div className="space-y-2">
                                {auditStats.last7days.dailyActivity.map((day) => {
                                    const total = Number(day.total) || 0
                                    const logins = Number(day.logins) || 0
                                    const denied = Number(day.denied) || 0
                                    const pct = Math.round((total / maxDailyTotal) * 100)
                                    return (
                                        <div key={day.date} className="flex items-center gap-3 text-sm">
                                            <span className="w-24 text-muted-foreground shrink-0">{formatDay(day.date)}</span>
                                            <div className="flex-1 bg-gray-100 rounded-full h-5 relative overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 rounded-full transition-all"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <span className="w-8 text-right font-medium">{total}</span>
                                            <div className="flex gap-2 shrink-0">
                                                <span className="text-green-600 text-xs">{logins}↑</span>
                                                <span className="text-orange-500 text-xs">{denied}✕</span>
                                            </div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Action breakdown */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Acciones (7 días)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isAuditLoading || !auditStats ? (
                            <div className="text-center text-muted-foreground py-8">Cargando...</div>
                        ) : (
                            <div className="space-y-2">
                                {auditStats.last7days.actionBreakdown.map((a) => (
                                    <div key={a.action} className="flex items-center justify-between text-sm">
                                        <Badge className={`text-xs font-mono ${ACTION_COLORS[a.action] || 'bg-gray-100 text-gray-800'}`}>
                                            {a.action}
                                        </Badge>
                                        <span className="font-semibold">{a.count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Top users (moved here to keep 3-col layout) */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-base">Top usuarios (7 días)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {isAuditLoading || !auditStats ? (
                            <div className="text-center text-muted-foreground py-8">Cargando...</div>
                        ) : auditStats.last7days.topUsers.length === 0 ? (
                            <div className="text-center text-muted-foreground py-8">Sin datos</div>
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {auditStats.last7days.topUsers.map((u, idx) => (
                                    <div key={u.email} className="flex items-center gap-3 text-sm">
                                        <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                                            {idx + 1}
                                        </span>
                                        <span className="flex-1 truncate text-muted-foreground" title={u.email}>{u.email}</span>
                                        <span className="font-semibold">{u.count}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

        </div>
    )
}
