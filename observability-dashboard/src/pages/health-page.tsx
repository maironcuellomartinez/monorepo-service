import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Header } from '../components/header'
import { logsApi, tracesApi } from '../lib/api'
import { isoHoursAgo } from '../lib/utils'
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from 'lucide-react'

interface ServiceHealth {
  service: string
  totalLogs: number
  errorLogs: number
  warnLogs: number
  errorRate: number      // 0-1
  p95Ms: number | null
  p50Ms: number | null
  throughputPerMin: number
  lastErrorMsg: string | null
  status: 'ok' | 'warn' | 'critical'
}

function computeStatus(errorRate: number): ServiceHealth['status'] {
  if (errorRate >= 0.05) return 'critical'
  if (errorRate >= 0.01) return 'warn'
  return 'ok'
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, idx)]
}

const STATUS_CONFIG = {
  ok:       { label: 'OK',       icon: CheckCircle2,   badge: 'bg-green-100  text-green-800  dark:bg-green-900  dark:text-green-200',  border: 'border-green-300  dark:border-green-700' },
  warn:     { label: 'WARN',     icon: AlertTriangle,  badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', border: 'border-yellow-300 dark:border-yellow-700' },
  critical: { label: 'CRÍTICO', icon: XCircle,         badge: 'bg-red-100    text-red-800    dark:bg-red-900    dark:text-red-200',    border: 'border-red-300    dark:border-red-700' },
}

export function HealthPage() {
  const [services, setServices] = useState<ServiceHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const [svcNames] = await Promise.all([logsApi.services()])
      if (svcNames.data.length === 0) { setServices([]); return }

      const FROM_1H = isoHoursAgo(1)

      const results = await Promise.allSettled(
        svcNames.data.map(async (service): Promise<ServiceHealth> => {
          const [totalRes, errorRes, warnRes, tracesRes, lastErrRes] = await Promise.allSettled([
            logsApi.query({ service, from: FROM_1H, limit: 1 }),
            logsApi.query({ service, level: 'error', from: FROM_1H, limit: 1 }),
            logsApi.query({ service, level: 'warn',  from: FROM_1H, limit: 1 }),
            tracesApi.query({ serviceName: service, from: FROM_1H, limit: 200 }),
            logsApi.query({ service, level: 'error', from: FROM_1H, limit: 1 }),
          ])

          const totalLogs  = totalRes.status  === 'fulfilled' ? totalRes.value.data.total  : 0
          const errorLogs  = errorRes.status  === 'fulfilled' ? errorRes.value.data.total  : 0
          const warnLogs   = warnRes.status   === 'fulfilled' ? warnRes.value.data.total   : 0
          const errorRate  = totalLogs > 0 ? errorLogs / totalLogs : 0

          let p50Ms: number | null = null
          let p95Ms: number | null = null
          if (tracesRes.status === 'fulfilled') {
            const durations = tracesRes.value.data.data
              .map(s => s.durationMs)
              .filter((d): d is number => d != null)
              .sort((a, b) => a - b)
            p50Ms = percentile(durations, 50)
            p95Ms = percentile(durations, 95)
          }

          let lastErrorMsg: string | null = null
          if (lastErrRes.status === 'fulfilled') {
            lastErrorMsg = lastErrRes.value.data.data[0]?.message ?? null
          }

          return {
            service,
            totalLogs,
            errorLogs,
            warnLogs,
            errorRate,
            p50Ms,
            p95Ms,
            throughputPerMin: Math.round(totalLogs / 60),
            lastErrorMsg,
            status: computeStatus(errorRate),
          }
        }),
      )

      const health = results
        .filter((r): r is PromiseFulfilledResult<ServiceHealth> => r.status === 'fulfilled')
        .map(r => r.value)
        .sort((a, b) => {
          const order = { critical: 0, warn: 1, ok: 2 }
          return order[a.status] - order[b.status]
        })

      setServices(health)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const counts = { ok: 0, warn: 0, critical: 0 }
  services.forEach(s => counts[s.status]++)

  return (
    <div className="flex flex-col h-full">
      <Header title="Service Health" onRefresh={load} refreshing={refreshing} />
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">

        {/* Summary bar */}
        {!loading && services.length > 0 && (
          <div className="flex items-center gap-4">
            <SummaryPill status="ok"       count={counts.ok}       />
            <SummaryPill status="warn"     count={counts.warn}     />
            <SummaryPill status="critical" count={counts.critical} />
            <span className="text-xs text-muted-foreground ml-auto">Ventana: última hora</span>
          </div>
        )}

        {/* Cards */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Analizando servicios...
          </div>
        ) : services.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            Sin datos de servicios en la última hora
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {services.map(svc => <ServiceCard key={svc.service} svc={svc} />)}
          </div>
        )}
      </div>
    </div>
  )
}

function SummaryPill({ status, count }: { status: ServiceHealth['status']; count: number }) {
  const cfg = STATUS_CONFIG[status]
  const Icon = cfg.icon
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Icon className={`h-4 w-4 ${status === 'ok' ? 'text-green-500' : status === 'warn' ? 'text-yellow-500' : 'text-red-500'}`} />
      <span className="font-semibold">{count}</span>
      <span className="text-muted-foreground">{cfg.label}</span>
    </div>
  )
}

function ServiceCard({ svc }: { svc: ServiceHealth }) {
  const cfg = STATUS_CONFIG[svc.status]
  const Icon = cfg.icon

  return (
    <Card className={`border-2 ${cfg.border}`}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold truncate">{svc.service}</CardTitle>
          <Badge className={`text-xs shrink-0 ${cfg.badge}`}>
            <Icon className="h-3 w-3 mr-1" />
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <Metric label="Error rate" value={`${(svc.errorRate * 100).toFixed(1)}%`}
            highlight={svc.status !== 'ok'} />
          <Metric label="Throughput"  value={`${svc.throughputPerMin} req/min`} />
          <Metric label="p50 latency" value={svc.p50Ms != null ? `${svc.p50Ms}ms` : '—'} />
          <Metric label="p95 latency" value={svc.p95Ms != null ? `${svc.p95Ms}ms` : '—'}
            highlight={svc.p95Ms != null && svc.p95Ms > 1000} />
          <Metric label="Errores (1h)"  value={svc.errorLogs.toLocaleString()} />
          <Metric label="Warnings (1h)" value={svc.warnLogs.toLocaleString()} />
        </div>
        {svc.lastErrorMsg && (
          <p className="mt-3 text-xs text-red-600 dark:text-red-400 truncate border-t border-border pt-2">
            {svc.lastErrorMsg}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`font-semibold ${highlight ? 'text-red-600 dark:text-red-400' : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  )
}
