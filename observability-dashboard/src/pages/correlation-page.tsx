import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Header } from '../components/header'
import { logsApi, tracesApi, metricsApi } from '../lib/api'
import { formatDate } from '../lib/utils'
import type { LogEntry, TraceSpan, MetricPoint } from '../types'
import { ScrollText, GitBranch, BarChart2, AlertCircle, Search } from 'lucide-react'

const LEVEL_BADGE: Record<string, string> = {
  error:   'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  warn:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  info:    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  http:    'bg-purple-100 text-purple-800',
  verbose: 'bg-gray-100 text-gray-700',
  debug:   'bg-slate-100 text-slate-700',
}

export function CorrelationPage() {
  const [input, setInput] = useState('')
  const [correlationId, setCorrelationId] = useState('')
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [traces, setTraces] = useState<TraceSpan[]>([])
  const [metrics, setMetrics] = useState<MetricPoint[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const search = async () => {
    if (!input.trim()) return
    setLoading(true)
    setError(null)
    setSearched(false)
    const id = input.trim()
    setCorrelationId(id)
    try {
      const [logsRes, tracesRes, metricsRes] = await Promise.allSettled([
        logsApi.query({ correlationId: id, limit: 200 }),
        tracesApi.query({ correlationId: id, limit: 200 }),
        metricsApi.query({ correlationId: id, limit: 200 }),
      ])
      setLogs(logsRes.status === 'fulfilled' ? logsRes.value.data.data : [])
      setTraces(tracesRes.status === 'fulfilled' ? tracesRes.value.data.data : [])
      setMetrics(metricsRes.status === 'fulfilled' ? metricsRes.value.data.data : [])
    } catch (e: any) {
      setError(e?.message || 'Error al buscar')
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }

  const hasResults = logs.length + traces.length + metrics.length > 0

  return (
    <div className="flex flex-col h-full">
      <Header title="Busqueda por Correlacion" />
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Search bar */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex gap-3">
              <Input
                placeholder="Ingresa un correlationId..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && search()}
                className="flex-1 font-mono"
              />
              <Button onClick={search} disabled={loading || !input.trim()}>
                <Search className="h-4 w-4 mr-2" />
                {loading ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
            {correlationId && searched && (
              <p className="text-xs text-muted-foreground mt-2 font-mono">
                correlationId: {correlationId}
              </p>
            )}
          </CardContent>
        </Card>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {searched && !hasResults && !loading && (
          <div className="text-center py-12 text-muted-foreground">
            Sin resultados para <span className="font-mono">{correlationId}</span>
          </div>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <ScrollText className="h-4 w-4 text-blue-500" />
                Logs ({logs.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {logs.map(log => (
                  <div key={log.id} className="text-xs border-b border-border pb-2 last:border-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`text-xs ${LEVEL_BADGE[log.level] ?? ''}`}>{log.level}</Badge>
                      <span className="text-muted-foreground">{log.service}</span>
                      <span className="text-muted-foreground">{formatDate(log.timestamp)}</span>
                    </div>
                    <p className="text-foreground">{log.message}</p>
                    {log.stack && (
                      <pre className="text-red-500 dark:text-red-400 whitespace-pre-wrap break-all text-xs mt-1 bg-muted/30 p-1 rounded">
                        {log.stack}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Traces */}
        {traces.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-violet-500" />
                Spans ({traces.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {traces.map(span => (
                  <div key={span.id} className="flex items-center gap-3 text-xs border-b border-border pb-1 last:border-0">
                    <span className="font-mono text-muted-foreground w-20 truncate">{span.traceId.slice(0, 8)}…</span>
                    <span className="flex-1 truncate">{span.name}</span>
                    <span className="text-muted-foreground">{span.serviceName}</span>
                    <span className="text-muted-foreground whitespace-nowrap">
                      {span.durationMs != null ? `${span.durationMs}ms` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Metrics */}
        {metrics.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-orange-500" />
                Metricas ({metrics.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                {metrics.map(m => (
                  <div key={m.id} className="flex items-center gap-3 text-xs border-b border-border pb-1 last:border-0">
                    <span className="font-mono flex-1 truncate">{m.name}</span>
                    <span className="text-muted-foreground">{m.service}</span>
                    <span className="font-semibold">{m.value}{m.unit ? ` ${m.unit}` : ''}</span>
                    <span className="text-muted-foreground whitespace-nowrap">{formatDate(m.timestamp)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
