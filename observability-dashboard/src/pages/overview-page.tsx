import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Header } from '../components/header'
import { healthApi, logsApi, tracesApi, metricsApi } from '../lib/api'
import { isoHoursAgo, formatDate } from '../lib/utils'
import type { HealthStatus, LogEntry } from '../types'
import { Activity, ScrollText, GitBranch, BarChart2, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'
import { format, parseISO, subHours, startOfHour } from 'date-fns'

const LEVEL_COLORS: Record<string, string> = {
  error: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  warn: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  http: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  verbose: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  debug: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
}

interface HourlyBucket {
  hour: string
  error: number
  warn: number
  info: number
}

export function OverviewPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null)
  const [totalLogs, setTotalLogs] = useState<number>(0)
  const [totalTraces, setTotalTraces] = useState<number>(0)
  const [totalMetrics, setTotalMetrics] = useState<number>(0)
  const [recentErrors, setRecentErrors] = useState<LogEntry[]>([])
  const [chartData, setChartData] = useState<HourlyBucket[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    const from = isoHoursAgo(24)
    try {
      const [healthRes, logsRes, tracesRes, metricsRes, errorsRes] = await Promise.allSettled([
        healthApi.get(),
        logsApi.query({ from, limit: 1 }),
        tracesApi.query({ from, limit: 1 }),
        metricsApi.query({ from, limit: 1 }),
        logsApi.query({ from, level: 'error', limit: 10 }),
      ])

      if (healthRes.status === 'fulfilled') setHealth(healthRes.value.data)
      if (logsRes.status === 'fulfilled') setTotalLogs(logsRes.value.data.total)
      if (tracesRes.status === 'fulfilled') setTotalTraces(tracesRes.value.data.total)
      if (metricsRes.status === 'fulfilled') setTotalMetrics(metricsRes.value.data.total)
      if (errorsRes.status === 'fulfilled') setRecentErrors(errorsRes.value.data.data)

      // Build hourly chart: last 12h
      try {
        const buckets: Record<string, HourlyBucket> = {}
        for (let i = 11; i >= 0; i--) {
          const h = format(startOfHour(subHours(new Date(), i)), 'HH:mm')
          buckets[h] = { hour: h, error: 0, warn: 0, info: 0 }
        }
        const chartLogsRes = await logsApi.query({ from: isoHoursAgo(12), limit: 500 })
        for (const log of chartLogsRes.data.data) {
          const h = format(startOfHour(parseISO(log.timestamp)), 'HH:mm')
          if (buckets[h]) {
            const lvl = log.level as 'error' | 'warn' | 'info'
            if (lvl === 'error' || lvl === 'warn' || lvl === 'info') buckets[h][lvl]++
          }
        }
        setChartData(Object.values(buckets))
      } catch { /* chart is best-effort */ }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const healthColor = health?.status === 'ok' ? 'text-green-600' : 'text-red-500'

  return (
    <div className="flex flex-col h-full">
      <Header title="Overview" onRefresh={load} refreshing={refreshing} />
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            icon={<Activity className={`h-5 w-5 ${healthColor}`} />}
            label="Estado"
            value={loading ? '—' : (health?.status ?? 'N/A')}
            sub={health ? `DB: ${health.db} · uptime ${Math.round(health.uptime / 60)}m` : undefined}
          />
          <KpiCard
            icon={<ScrollText className="h-5 w-5 text-blue-500" />}
            label="Logs (24h)"
            value={loading ? '—' : totalLogs.toLocaleString()}
          />
          <KpiCard
            icon={<GitBranch className="h-5 w-5 text-violet-500" />}
            label="Traces (24h)"
            value={loading ? '—' : totalTraces.toLocaleString()}
          />
          <KpiCard
            icon={<BarChart2 className="h-5 w-5 text-orange-500" />}
            label="Metricas (24h)"
            value={loading ? '—' : totalMetrics.toLocaleString()}
          />
        </div>

        {/* Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Logs por nivel — ultimas 12 horas</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="error" stroke="#ef4444" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="warn"  stroke="#f59e0b" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="info"  stroke="#3b82f6" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Recent Errors */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              Errores recientes (24h)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentErrors.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                Sin errores en las ultimas 24 horas
              </div>
            ) : (
              <div className="space-y-2">
                {recentErrors.map(log => (
                  <div key={log.id} className="flex items-start gap-3 text-sm border-b border-border pb-2 last:border-0">
                    <XCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={LEVEL_COLORS[log.level]}>{log.level}</Badge>
                        <span className="text-muted-foreground text-xs">{log.service}</span>
                        <span className="text-muted-foreground text-xs">{formatDate(log.timestamp)}</span>
                      </div>
                      <p className="mt-1 truncate text-foreground">{log.message}</p>
                    </div>
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

function KpiCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</span>
          {icon}
        </div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  )
}
