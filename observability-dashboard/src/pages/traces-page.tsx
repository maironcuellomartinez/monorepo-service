import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Header } from '../components/header'
import { tracesApi } from '../lib/api'
import { isoHoursAgo, formatDate } from '../lib/utils'
import type { TraceSpan, TracesQuery } from '../types'
import { ChevronLeft, ChevronRight, AlertCircle, GitBranch } from 'lucide-react'

const PAGE_SIZE = 50

export function TracesPage() {
  const [spans, setSpans] = useState<TraceSpan[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [services, setServices] = useState<string[]>([])
  const [waterfallTraceId, setWaterfallTraceId] = useState<string | null>(null)
  const [waterfallSpans, setWaterfallSpans] = useState<TraceSpan[]>([])
  const [waterfallLoading, setWaterfallLoading] = useState(false)

  const [filters, setFilters] = useState({
    traceId: '',
    correlationId: '',
    serviceName: '',
    hours: '24',
  })

  const load = useCallback(async (p = 0) => {
    setLoading(true)
    setError(null)
    try {
      const params: TracesQuery = {
        from: isoHoursAgo(Number(filters.hours)),
        limit: PAGE_SIZE,
        offset: p * PAGE_SIZE,
        ...(filters.traceId ? { traceId: filters.traceId } : {}),
        ...(filters.correlationId ? { correlationId: filters.correlationId } : {}),
        ...(filters.serviceName ? { serviceName: filters.serviceName } : {}),
      }
      const { data } = await tracesApi.query(params)
      setSpans(data.data)
      setTotal(data.total)
      setPage(p)
    } catch (e: any) {
      setError(e?.message || 'Error al cargar traces')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    tracesApi.services().then(r => setServices(r.data)).catch(() => {})
  }, [])

  useEffect(() => { load(0) }, [load])

  const openWaterfall = async (traceId: string) => {
    setWaterfallTraceId(traceId)
    setWaterfallLoading(true)
    try {
      const { data } = await tracesApi.getTrace(traceId)
      setWaterfallSpans(data)
    } catch {
      setWaterfallSpans([])
    } finally {
      setWaterfallLoading(false)
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex flex-col h-full">
      <Header title="Traces" onRefresh={() => load(page)} refreshing={loading} />
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Input
                placeholder="traceId"
                value={filters.traceId}
                onChange={e => setFilters(f => ({ ...f, traceId: e.target.value }))}
              />
              <Input
                placeholder="correlationId"
                value={filters.correlationId}
                onChange={e => setFilters(f => ({ ...f, correlationId: e.target.value }))}
              />
              <Select value={filters.serviceName || '_all'} onValueChange={v => setFilters(f => ({ ...f, serviceName: v === '_all' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Servicio" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {services.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filters.hours} onValueChange={v => setFilters(f => ({ ...f, hours: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Ultima hora</SelectItem>
                  <SelectItem value="6">Ultimas 6h</SelectItem>
                  <SelectItem value="24">Ultimas 24h</SelectItem>
                  <SelectItem value="72">Ultimas 72h</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        <div className="text-sm text-muted-foreground">
          {total.toLocaleString()} span{total !== 1 ? 's' : ''}{loading && ' · cargando...'}
        </div>

        {/* Spans table */}
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-36">Servicio</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-20">Estado</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-20">Dur (ms)</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-40">Inicio</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-20"></th>
              </tr>
            </thead>
            <tbody>
              {spans.map(span => (
                <tr key={span.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs truncate max-w-[12rem]">{span.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[9rem]">{span.serviceName}</td>
                  <td className="px-3 py-2">
                    <StatusBadge code={span.statusCode} />
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {span.durationMs != null ? span.durationMs : '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(span.startTime)}</td>
                  <td className="px-3 py-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openWaterfall(span.traceId)}>
                      <GitBranch className="h-3 w-3 mr-1" /> Trace
                    </Button>
                  </td>
                </tr>
              ))}
              {spans.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">Sin resultados</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Pagina {page + 1} de {totalPages}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => load(page - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => load(page + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Waterfall modal */}
        {waterfallTraceId && (
          <WaterfallPanel
            traceId={waterfallTraceId}
            spans={waterfallSpans}
            loading={waterfallLoading}
            onClose={() => { setWaterfallTraceId(null); setWaterfallSpans([]) }}
          />
        )}
      </div>
    </div>
  )
}

function StatusBadge({ code }: { code: string | null }) {
  if (!code) return <span className="text-xs text-muted-foreground">—</span>
  const isOk = code === 'OK' || code === '0' || code === 'STATUS_CODE_OK' || code === 'UNSET'
  return (
    <Badge className={`text-xs ${isOk ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
      {code}
    </Badge>
  )
}

function WaterfallPanel({
  traceId,
  spans,
  loading,
  onClose,
}: {
  traceId: string
  spans: TraceSpan[]
  loading: boolean
  onClose: () => void
}) {
  const minStart = spans.reduce((m, s) => (s.startTime < m ? s.startTime : m), spans[0]?.startTime ?? '')
  const maxEnd = spans.reduce((m, s) => (s.endTime > m ? s.endTime : m), spans[0]?.endTime ?? '')
  const totalMs = minStart && maxEnd
    ? Math.round(Number((BigInt(maxEnd) - BigInt(minStart)) / BigInt(1_000_000)))
    : 1

  return (
    <Card className="border-2 border-violet-400">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium font-mono truncate">{traceId}</CardTitle>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>Cerrar</Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Cargando spans...</p>
        ) : spans.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin spans</p>
        ) : (
          <div className="space-y-1">
            {spans.map(span => {
              const offsetMs = minStart ? Math.round(Number((BigInt(span.startTime) - BigInt(minStart)) / BigInt(1_000_000))) : 0
              const widthMs = span.durationMs ?? 1
              const leftPct = totalMs > 0 ? (offsetMs / totalMs) * 100 : 0
              const widthPct = totalMs > 0 ? Math.max((widthMs / totalMs) * 100, 0.5) : 0.5
              return (
                <div key={span.id} className="flex items-center gap-2 text-xs">
                  <div className="w-48 truncate text-muted-foreground font-mono" title={span.name}>{span.name}</div>
                  <div className="flex-1 relative h-5 bg-muted/30 rounded overflow-hidden">
                    <div
                      className="absolute top-0 h-full rounded bg-violet-500/70"
                      style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                    />
                    <span className="absolute inset-0 flex items-center px-1 text-xs text-foreground/70">
                      {span.durationMs != null ? `${span.durationMs}ms` : ''}
                    </span>
                  </div>
                  <StatusBadge code={span.statusCode} />
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
