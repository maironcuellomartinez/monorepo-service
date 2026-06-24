import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Header } from '../components/header'
import { logsApi, tracesApi } from '../lib/api'
import { isoHoursAgo } from '../lib/utils'
import type { TraceSpan, LogEntry } from '../types'
import { Loader2, TrendingUp } from 'lucide-react'

const HOURS_OPTIONS = [
  { label: 'Última hora',    value: '1'  },
  { label: 'Últimas 6h',    value: '6'  },
  { label: 'Últimas 24h',   value: '24' },
  { label: 'Últimas 72h',   value: '72' },
]

type Tab = 'endpoints' | 'errors' | 'correlations' | 'services'

export function TopNPage() {
  const [tab, setTab]     = useState<Tab>('endpoints')
  const [hours, setHours] = useState('24')
  const [loading, setLoading] = useState(false)

  // Data
  const [slowSpans,     setSlowSpans]     = useState<TraceSpan[]>([])
  const [topErrors,     setTopErrors]     = useState<Array<{ message: string; count: number; service: string }>>([])
  const [topCorrels,    setTopCorrels]    = useState<Array<{ correlationId: string; count: number }>>([])
  const [topServices,   setTopServices]   = useState<Array<{ service: string; errors: number; total: number; rate: number }>>([])

  const load = useCallback(async () => {
    setLoading(true)
    const from = isoHoursAgo(Number(hours))
    try {
      const [spansRes, errorsRes, svcsRes] = await Promise.allSettled([
        tracesApi.query({ from, limit: 500 }),
        logsApi.query({ level: 'error', from, limit: 500 }),
        logsApi.services(),
      ])

      // ── Top 10 endpoints más lentos ────────────────────────────────────────
      if (spansRes.status === 'fulfilled') {
        const byName: Record<string, { total: number; count: number; max: number }> = {}
        for (const s of spansRes.value.data.data) {
          if (s.durationMs == null) continue
          if (!byName[s.name]) byName[s.name] = { total: 0, count: 0, max: 0 }
          byName[s.name].total += s.durationMs
          byName[s.name].count++
          byName[s.name].max = Math.max(byName[s.name].max, s.durationMs)
        }
        const sorted = Object.entries(byName)
          .map(([name, v]) => ({ name, avg: Math.round(v.total / v.count), max: v.max, count: v.count }))
          .sort((a, b) => b.avg - a.avg)
          .slice(0, 10)
        // Re-fetch top span details for context
        const topSpans = spansRes.value.data.data
          .filter(s => s.durationMs != null)
          .sort((a, b) => (b.durationMs ?? 0) - (a.durationMs ?? 0))
          .slice(0, 10)
        setSlowSpans(topSpans)
      }

      // ── Top errores frecuentes ─────────────────────────────────────────────
      if (errorsRes.status === 'fulfilled') {
        const msgMap: Record<string, { count: number; service: string }> = {}
        for (const log of errorsRes.value.data.data) {
          const key = log.message.slice(0, 120) // normalize by prefix
          if (!msgMap[key]) msgMap[key] = { count: 0, service: log.service }
          msgMap[key].count++
        }
        setTopErrors(
          Object.entries(msgMap)
            .map(([message, v]) => ({ message, ...v }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10),
        )

        // ── Top correlationIds problemáticos ──────────────────────────────────
        const correlMap: Record<string, number> = {}
        for (const log of errorsRes.value.data.data) {
          if (!log.correlationId) continue
          correlMap[log.correlationId] = (correlMap[log.correlationId] ?? 0) + 1
        }
        setTopCorrels(
          Object.entries(correlMap)
            .map(([correlationId, count]) => ({ correlationId, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10),
        )
      }

      // ── Top servicios por error rate ───────────────────────────────────────
      if (svcsRes.status === 'fulfilled') {
        const serviceResults = await Promise.allSettled(
          svcsRes.value.data.map(async service => {
            const [tot, err] = await Promise.allSettled([
              logsApi.query({ service, from, limit: 1 }),
              logsApi.query({ service, level: 'error', from, limit: 1 }),
            ])
            const total  = tot.status === 'fulfilled' ? tot.value.data.total : 0
            const errors = err.status === 'fulfilled' ? err.value.data.total : 0
            return { service, errors, total, rate: total > 0 ? errors / total : 0 }
          }),
        )
        setTopServices(
          serviceResults
            .filter((r): r is PromiseFulfilledResult<{ service: string; errors: number; total: number; rate: number }> => r.status === 'fulfilled')
            .map(r => r.value)
            .sort((a, b) => b.errors - a.errors)
            .slice(0, 10),
        )
      }
    } finally {
      setLoading(false)
    }
  }, [hours])

  useEffect(() => { load() }, [load])

  const TABS: { key: Tab; label: string }[] = [
    { key: 'endpoints',    label: 'Endpoints lentos' },
    { key: 'errors',       label: 'Errores frecuentes' },
    { key: 'correlations', label: 'CorrelationIDs' },
    { key: 'services',     label: 'Servicios' },
  ]

  return (
    <div className="flex flex-col h-full">
      <Header title="Top-N Analysis" onRefresh={load} refreshing={loading} />
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {/* Controls */}
        <div className="flex items-center gap-3">
          <div className="flex border border-border rounded-md overflow-hidden text-sm">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 transition-colors ${
                  tab === t.key
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Select value={hours} onValueChange={setHours}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {HOURS_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>

        {/* Content */}
        {tab === 'endpoints' && (
          <RankCard title="Top 10 Spans más lentos" icon="🐢">
            {slowSpans.length === 0 ? <Empty /> : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nombre</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground w-32">Servicio</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">Duración</th>
                  </tr>
                </thead>
                <tbody>
                  {slowSpans.map((s, i) => (
                    <tr key={s.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 text-muted-foreground text-xs">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs truncate max-w-xs">{s.name}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground truncate">{s.serviceName}</td>
                      <td className="px-3 py-2 text-right">
                        <span className={`font-semibold text-sm ${(s.durationMs ?? 0) > 1000 ? 'text-red-600 dark:text-red-400' : (s.durationMs ?? 0) > 500 ? 'text-yellow-600' : ''}`}>
                          {s.durationMs}ms
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </RankCard>
        )}

        {tab === 'errors' && (
          <RankCard title="Top 10 Errores más frecuentes" icon="🔥">
            {topErrors.length === 0 ? <Empty /> : (
              <div className="space-y-2">
                {topErrors.map((e, i) => (
                  <div key={i} className="flex items-start gap-3 border-b border-border pb-2 last:border-0">
                    <span className="text-muted-foreground text-xs w-5 shrink-0 pt-0.5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{e.message}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{e.service}</p>
                    </div>
                    <Badge className="shrink-0 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                      {e.count}×
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </RankCard>
        )}

        {tab === 'correlations' && (
          <RankCard title="Top 10 CorrelationIDs con más errores" icon="🔗">
            {topCorrels.length === 0 ? <Empty text="Sin errores con correlationId en el período" /> : (
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">#</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">CorrelationId</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground w-24">Errores</th>
                  </tr>
                </thead>
                <tbody>
                  {topCorrels.map((c, i) => (
                    <tr key={c.correlationId} className="border-t border-border hover:bg-muted/30">
                      <td className="px-3 py-2 text-muted-foreground text-xs">{i + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs">{c.correlationId}</td>
                      <td className="px-3 py-2 text-right">
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                          {c.count}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </RankCard>
        )}

        {tab === 'services' && (
          <RankCard title="Top servicios por volumen de errores" icon="📊">
            {topServices.length === 0 ? <Empty /> : (
              <div className="space-y-3">
                {topServices.map((svc, i) => {
                  const ratePct = (svc.rate * 100).toFixed(1)
                  const barWidth = topServices[0].errors > 0
                    ? (svc.errors / topServices[0].errors) * 100
                    : 0
                  return (
                    <div key={svc.service}>
                      <div className="flex items-center justify-between text-sm mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground text-xs w-5">{i + 1}</span>
                          <span className="font-medium">{svc.service}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{svc.errors.toLocaleString()} errores</span>
                          <span className={`font-semibold ${Number(ratePct) >= 5 ? 'text-red-600 dark:text-red-400' : Number(ratePct) >= 1 ? 'text-yellow-600' : 'text-green-600'}`}>
                            {ratePct}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${Number(ratePct) >= 5 ? 'bg-red-500' : Number(ratePct) >= 1 ? 'bg-yellow-500' : 'bg-green-500'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </RankCard>
        )}
      </div>
    </div>
  )
}

function RankCard({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <span>{icon}</span>
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

function Empty({ text = 'Sin datos en el período seleccionado' }: { text?: string }) {
  return <p className="text-sm text-muted-foreground py-4 text-center">{text}</p>
}
