import { useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Header } from '../components/header'
import { logsApi, tracesApi } from '../lib/api'
import { isoHoursAgo, formatDate } from '../lib/utils'
import type { LogEntry, TraceSpan } from '../types'
import { Loader2, AlertCircle, Zap, Clock, Search } from 'lucide-react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { format, parseISO, startOfMinute, subMinutes, subHours } from 'date-fns'

type RangeKey = '1h' | '3h' | '6h' | '12h' | '24h'

const RANGES: { key: RangeKey; label: string; hours: number; bucketMins: number }[] = [
  { key: '1h',  label: '1h',  hours: 1,  bucketMins: 5  },
  { key: '3h',  label: '3h',  hours: 3,  bucketMins: 10 },
  { key: '6h',  label: '6h',  hours: 6,  bucketMins: 15 },
  { key: '12h', label: '12h', hours: 12, bucketMins: 30 },
  { key: '24h', label: '24h', hours: 24, bucketMins: 60 },
]

interface Bucket {
  time: string
  errors: number
  warns: number
  slowSpans: number
}

interface TimelineEvent {
  ts: string
  type: 'error' | 'warn' | 'slow'
  message: string
  service: string
  durationMs?: number
}

export function TimelinePage() {
  const [range, setRange]         = useState<RangeKey>('6h')
  const [loading, setLoading]     = useState(false)
  const [buckets, setBuckets]     = useState<Bucket[]>([])
  const [events, setEvents]       = useState<TimelineEvent[]>([])
  const [searched, setSearched]   = useState(false)
  const [totalErrors, setTotalErrors] = useState(0)
  const [totalWarns,  setTotalWarns]  = useState(0)
  const [slowThreshold, setSlowThreshold] = useState('1000')

  const analyze = useCallback(async () => {
    setLoading(true)
    const cfg = RANGES.find(r => r.key === range)!
    const from = isoHoursAgo(cfg.hours)
    const slowMs = Number(slowThreshold)

    try {
      const [errorsRes, warnsRes, tracesRes] = await Promise.allSettled([
        logsApi.query({ level: 'error', from, limit: 500 }),
        logsApi.query({ level: 'warn',  from, limit: 500 }),
        tracesApi.query({ from, limit: 500 }),
      ])

      const errorLogs: LogEntry[]  = errorsRes.status === 'fulfilled' ? errorsRes.value.data.data : []
      const warnLogs:  LogEntry[]  = warnsRes.status  === 'fulfilled' ? warnsRes.value.data.data  : []
      const spans:     TraceSpan[] = tracesRes.status === 'fulfilled' ? tracesRes.value.data.data : []
      const slowSpans  = spans.filter(s => (s.durationMs ?? 0) >= slowMs)

      setTotalErrors(errorsRes.status === 'fulfilled' ? errorsRes.value.data.total : 0)
      setTotalWarns(warnsRes.status   === 'fulfilled' ? warnsRes.value.data.total  : 0)

      // Build time buckets
      const now      = new Date()
      const bucketMs = cfg.bucketMins * 60_000
      const bucketMap: Record<string, Bucket> = {}

      const totalBuckets = Math.ceil((cfg.hours * 60) / cfg.bucketMins)
      for (let i = totalBuckets - 1; i >= 0; i--) {
        const t = format(subMinutes(now, i * cfg.bucketMins), cfg.bucketMins >= 60 ? 'HH:mm' : 'HH:mm')
        bucketMap[t] = { time: t, errors: 0, warns: 0, slowSpans: 0 }
      }

      const toBucketKey = (iso: string) => {
        const d = parseISO(iso)
        const offset = Math.floor((now.getTime() - d.getTime()) / bucketMs)
        return format(subMinutes(now, offset * cfg.bucketMins), cfg.bucketMins >= 60 ? 'HH:mm' : 'HH:mm')
      }

      for (const log of errorLogs) {
        const k = toBucketKey(log.timestamp)
        if (bucketMap[k]) bucketMap[k].errors++
      }
      for (const log of warnLogs) {
        const k = toBucketKey(log.timestamp)
        if (bucketMap[k]) bucketMap[k].warns++
      }
      for (const span of slowSpans) {
        const k = toBucketKey(span.startTime)
        if (bucketMap[k]) bucketMap[k].slowSpans++
      }

      setBuckets(Object.values(bucketMap))

      // Build event list (most recent first, max 50)
      const allEvents: TimelineEvent[] = [
        ...errorLogs.map(l => ({
          ts: l.timestamp, type: 'error' as const,
          message: l.message, service: l.service,
        })),
        ...warnLogs.map(l => ({
          ts: l.timestamp, type: 'warn' as const,
          message: l.message, service: l.service,
        })),
        ...slowSpans.map(s => ({
          ts: s.startTime, type: 'slow' as const,
          message: s.name, service: s.serviceName,
          durationMs: s.durationMs ?? undefined,
        })),
      ]
      allEvents.sort((a, b) => b.ts.localeCompare(a.ts))
      setEvents(allEvents.slice(0, 50))
      setSearched(true)
    } finally {
      setLoading(false)
    }
  }, [range, slowThreshold])

  const hasData = buckets.some(b => b.errors + b.warns + b.slowSpans > 0)

  return (
    <div className="flex flex-col h-full">
      <Header title="Incident Timeline" onRefresh={searched ? analyze : undefined} refreshing={loading} />
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {/* Controls */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex border border-border rounded-md overflow-hidden text-sm">
                {RANGES.map(r => (
                  <button
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    className={`px-3 py-1.5 transition-colors ${
                      range === r.key
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground whitespace-nowrap">Span lento ≥</span>
                <Select value={slowThreshold} onValueChange={setSlowThreshold}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="500">500ms</SelectItem>
                    <SelectItem value="1000">1000ms</SelectItem>
                    <SelectItem value="2000">2000ms</SelectItem>
                    <SelectItem value="5000">5000ms</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={analyze} disabled={loading} className="ml-auto">
                {loading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Analizando...</>
                  : <><Search className="h-4 w-4 mr-2" />Analizar</>}
              </Button>
            </div>
          </CardContent>
        </Card>

        {searched && (
          <>
            {/* Summary pills */}
            <div className="flex items-center gap-4 text-sm">
              <Pill icon={<AlertCircle className="h-4 w-4 text-red-500" />}   label="Errores totales"  value={totalErrors} color="text-red-600 dark:text-red-400" />
              <Pill icon={<Zap className="h-4 w-4 text-yellow-500" />}        label="Warnings totales" value={totalWarns}  color="text-yellow-600" />
              <Pill icon={<Clock className="h-4 w-4 text-orange-500" />}      label={`Spans ≥${slowThreshold}ms`} value={events.filter(e => e.type === 'slow').length} color="text-orange-600" />
            </div>

            {/* Chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Distribución temporal</CardTitle>
              </CardHeader>
              <CardContent>
                {!hasData ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Sin eventos en el período</p>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <ComposedChart data={buckets}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis yAxisId="left"  tick={{ fontSize: 11 }} allowDecimals={false} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip />
                      <Legend />
                      <Bar    yAxisId="left"  dataKey="errors"    fill="#ef4444" name="Errores"  radius={[2, 2, 0, 0]} />
                      <Bar    yAxisId="left"  dataKey="warns"     fill="#f59e0b" name="Warnings" radius={[2, 2, 0, 0]} />
                      <Line  yAxisId="right" dataKey="slowSpans" stroke="#f97316" strokeWidth={2} dot={false} name="Spans lentos" />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Event list */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Eventos recientes (max 50)</CardTitle>
              </CardHeader>
              <CardContent>
                {events.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Sin eventos</p>
                ) : (
                  <div className="space-y-1.5 max-h-96 overflow-y-auto">
                    {events.map((ev, i) => (
                      <div key={i} className="flex items-start gap-3 text-xs border-b border-border pb-1.5 last:border-0">
                        <EventBadge type={ev.type} />
                        <div className="flex-1 min-w-0">
                          <span className="text-muted-foreground">{ev.service} · {formatDate(ev.ts)}</span>
                          <p className="truncate text-foreground">{ev.message}</p>
                        </div>
                        {ev.durationMs != null && (
                          <span className="text-orange-600 dark:text-orange-400 shrink-0 font-semibold">{ev.durationMs}ms</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {!searched && !loading && (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <Search className="h-8 w-8" />
            <p className="text-sm">Selecciona un rango y haz clic en Analizar</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Pill({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className={`font-bold ${color}`}>{value.toLocaleString()}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  )
}

function EventBadge({ type }: { type: 'error' | 'warn' | 'slow' }) {
  if (type === 'error') return <Badge className="text-xs shrink-0 bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">ERR</Badge>
  if (type === 'warn')  return <Badge className="text-xs shrink-0 bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">WARN</Badge>
  return <Badge className="text-xs shrink-0 bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">SLOW</Badge>
}
