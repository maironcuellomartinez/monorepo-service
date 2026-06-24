import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Header } from '../components/header'
import { logsApi, tracesApi } from '../lib/api'
import { isoHoursAgo } from '../lib/utils'
import { Loader2, Search, Target, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts'

interface SloResult {
  service: string
  totalLogs: number
  errorLogs: number
  availability: number      // 0-1
  latencyBudget: number     // 0-1 — % de spans bajo el umbral
  spanCount: number
  slowSpanCount: number
  errorBudgetUsed: number   // 0-1 — qué % del error budget se consumió (target = 1%)
  budgetStatus: 'ok' | 'warn' | 'critical'
}

const WINDOW_OPTIONS = [
  { label: '24 horas', value: '24',  hours: 24  },
  { label: '7 días',   value: '168', hours: 168 },
  { label: '30 días',  value: '720', hours: 720 },
]

function budgetStatus(availability: number, target: number): SloResult['budgetStatus'] {
  const errorRate = 1 - availability
  const targetErr = 1 - target
  const ratio = targetErr > 0 ? errorRate / targetErr : Infinity
  if (ratio >= 1)    return 'critical'
  if (ratio >= 0.75) return 'warn'
  return 'ok'
}

const STATUS_ICON = {
  ok:       <CheckCircle2 className="h-4 w-4 text-green-500" />,
  warn:     <AlertTriangle className="h-4 w-4 text-yellow-500" />,
  critical: <XCircle className="h-4 w-4 text-red-500" />,
}

const STATUS_COLOR = {
  ok:       'text-green-600 dark:text-green-400',
  warn:     'text-yellow-600 dark:text-yellow-400',
  critical: 'text-red-600 dark:text-red-400',
}

export function SloPage() {
  const [window,       setWindow]       = useState('24')
  const [latencyMs,    setLatencyMs]    = useState('500')
  const [sloTarget,    setSloTarget]    = useState('99')       // %
  const [loading,      setLoading]      = useState(false)
  const [results,      setResults]      = useState<SloResult[]>([])
  const [searched,     setSearched]     = useState(false)

  const targetAvail = Number(sloTarget) / 100
  const latencyThreshold = Number(latencyMs)

  const analyze = useCallback(async () => {
    setLoading(true)
    const hours = Number(window)
    const from  = isoHoursAgo(hours)

    try {
      const svcsRes = await logsApi.services()
      const services = svcsRes.data

      const allResults = await Promise.allSettled(
        services.map(async (service): Promise<SloResult> => {
          const [totalRes, errorRes, tracesRes] = await Promise.allSettled([
            logsApi.query({ service, from, limit: 1 }),
            logsApi.query({ service, level: 'error', from, limit: 1 }),
            tracesApi.query({ serviceName: service, from, limit: 500 }),
          ])

          const totalLogs = totalRes.status === 'fulfilled' ? totalRes.value.data.total : 0
          const errorLogs = errorRes.status === 'fulfilled' ? errorRes.value.data.total : 0
          const availability = totalLogs > 0 ? 1 - errorLogs / totalLogs : 1

          let spanCount = 0
          let slowSpanCount = 0
          let latencyBudget = 1
          if (tracesRes.status === 'fulfilled') {
            spanCount     = tracesRes.value.data.data.length
            slowSpanCount = tracesRes.value.data.data.filter(s => (s.durationMs ?? 0) > latencyThreshold).length
            latencyBudget = spanCount > 0 ? 1 - slowSpanCount / spanCount : 1
          }

          const errorBudgetUsed = (() => {
            const targetErr = 1 - targetAvail
            const actualErr = 1 - availability
            return targetErr > 0 ? Math.min(actualErr / targetErr, 2) : (actualErr > 0 ? 1 : 0)
          })()

          return {
            service,
            totalLogs,
            errorLogs,
            availability,
            latencyBudget,
            spanCount,
            slowSpanCount,
            errorBudgetUsed,
            budgetStatus: budgetStatus(availability, targetAvail),
          }
        }),
      )

      const sorted = allResults
        .filter((r): r is PromiseFulfilledResult<SloResult> => r.status === 'fulfilled')
        .map(r => r.value)
        .sort((a, b) => a.availability - b.availability)

      setResults(sorted)
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }, [window, latencyThreshold, targetAvail])

  const globalAvail = results.length > 0
    ? results.reduce((s, r) => s + r.availability, 0) / results.length
    : null

  return (
    <div className="flex flex-col h-full">
      <Header title="SLO Dashboard" onRefresh={searched ? analyze : undefined} refreshing={loading} />
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {/* Controls */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Ventana:</span>
                <Select value={window} onValueChange={setWindow}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WINDOW_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Target SLO:</span>
                <Select value={sloTarget} onValueChange={setSloTarget}>
                  <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="99.9">99.9%</SelectItem>
                    <SelectItem value="99">99%</SelectItem>
                    <SelectItem value="95">95%</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Latencia umbral:</span>
                <Select value={latencyMs} onValueChange={setLatencyMs}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="200">200ms</SelectItem>
                    <SelectItem value="500">500ms</SelectItem>
                    <SelectItem value="1000">1000ms</SelectItem>
                    <SelectItem value="2000">2000ms</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={analyze} disabled={loading} className="ml-auto">
                {loading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calculando...</>
                  : <><Search className="h-4 w-4 mr-2" />Calcular SLOs</>}
              </Button>
            </div>
          </CardContent>
        </Card>

        {searched && (
          <>
            {/* Global gauge */}
            {globalAvail !== null && (
              <Card>
                <CardHeader className="pb-0">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Availability global (promedio)
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex items-center gap-8 pt-2">
                  <div className="w-32 h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <RadialBarChart
                        innerRadius="65%"
                        outerRadius="100%"
                        data={[{ value: globalAvail * 100, fill: globalAvail >= targetAvail ? '#22c55e' : globalAvail >= targetAvail * 0.99 ? '#f59e0b' : '#ef4444' }]}
                        startAngle={90}
                        endAngle={-270}
                      >
                        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                        <RadialBar dataKey="value" cornerRadius={6} background={{ fill: '#e5e7eb' }} />
                      </RadialBarChart>
                    </ResponsiveContainer>
                  </div>
                  <div>
                    <p className={`text-4xl font-bold tabular-nums ${globalAvail >= targetAvail ? 'text-green-600' : 'text-red-600'}`}>
                      {(globalAvail * 100).toFixed(2)}%
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">Target: {sloTarget}%</p>
                    <p className={`text-sm mt-0.5 font-medium ${globalAvail >= targetAvail ? 'text-green-600' : 'text-red-600'}`}>
                      {globalAvail >= targetAvail ? 'SLO cumplido' : 'SLO violado'}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Per-service cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {results.map(r => (
                <SloCard key={r.service} result={r} target={targetAvail} latencyMs={latencyThreshold} />
              ))}
            </div>
          </>
        )}

        {!searched && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Target className="h-8 w-8" />
            <p className="text-sm">Configura los parámetros y haz clic en Calcular SLOs</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SloCard({ result: r, target, latencyMs }: { result: SloResult; target: number; latencyMs: number }) {
  const availPct   = (r.availability  * 100).toFixed(2)
  const latPct     = (r.latencyBudget * 100).toFixed(1)
  const budgetUsed = Math.min(r.errorBudgetUsed * 100, 100).toFixed(1)

  const barColor = r.budgetStatus === 'ok' ? 'bg-green-500'
    : r.budgetStatus === 'warn' ? 'bg-yellow-500'
    : 'bg-red-500'

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold truncate">{r.service}</CardTitle>
          {STATUS_ICON[r.budgetStatus]}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Availability */}
        <SloMetric
          label="Availability"
          value={`${availPct}%`}
          target={`${(target * 100).toFixed(1)}%`}
          status={r.budgetStatus}
        />

        {/* Error budget */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Error budget usado</span>
            <span className={`font-medium ${STATUS_COLOR[r.budgetStatus]}`}>{budgetUsed}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${Math.min(Number(budgetUsed), 100)}%` }} />
          </div>
        </div>

        {/* Latency budget */}
        {r.spanCount > 0 && (
          <SloMetric
            label={`Latencia < ${latencyMs}ms`}
            value={`${latPct}%`}
            target="—"
            status={r.latencyBudget >= 0.95 ? 'ok' : r.latencyBudget >= 0.8 ? 'warn' : 'critical'}
          />
        )}

        {/* Stats */}
        <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t border-border">
          <span>{r.totalLogs.toLocaleString()} logs</span>
          <span>{r.errorLogs.toLocaleString()} errores</span>
          {r.spanCount > 0 && <span>{r.spanCount} spans</span>}
        </div>
      </CardContent>
    </Card>
  )
}

function SloMetric({
  label, value, target, status,
}: {
  label: string; value: string; target: string; status: SloResult['budgetStatus']
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="flex items-center gap-2">
        {target !== '—' && <span className="text-xs text-muted-foreground">target: {target}</span>}
        <span className={`font-bold ${STATUS_COLOR[status]}`}>{value}</span>
      </div>
    </div>
  )
}
