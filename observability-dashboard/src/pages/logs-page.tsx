import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Header } from '../components/header'
import { logsApi } from '../lib/api'
import { formatDate, isoHoursAgo } from '../lib/utils'
import type { LogEntry, LogLevel } from '../types'
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'

const LEVELS: LogLevel[] = ['error', 'warn', 'info', 'http', 'verbose', 'debug']
const PAGE_SIZE = 50

const LEVEL_BADGE: Record<LogLevel, string> = {
  error:   'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  warn:    'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  info:    'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  http:    'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  verbose: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  debug:   'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
}

export function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [services, setServices] = useState<string[]>([])
  const [expanded, setExpanded] = useState<string | null>(null)

  const [filters, setFilters] = useState({
    service: '',
    level: '' as LogLevel | '',
    correlationId: '',
    search: '',
    hours: '24',
  })

  const load = useCallback(async (p = 0) => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await logsApi.query({
        ...(filters.service ? { service: filters.service } : {}),
        ...(filters.level ? { level: filters.level as LogLevel } : {}),
        ...(filters.correlationId ? { correlationId: filters.correlationId } : {}),
        ...(filters.search ? { search: filters.search } : {}),
        from: isoHoursAgo(Number(filters.hours)),
        limit: PAGE_SIZE,
        offset: p * PAGE_SIZE,
      })
      setLogs(data.data)
      setTotal(data.total)
      setPage(p)
    } catch (e: any) {
      setError(e?.message || 'Error al cargar logs')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    logsApi.services().then(r => setServices(r.data)).catch(() => {})
  }, [])

  useEffect(() => { load(0) }, [load])

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex flex-col h-full">
      <Header title="Logs" onRefresh={() => load(page)} refreshing={loading} />
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              <Select value={filters.service || '_all'} onValueChange={v => setFilters(f => ({ ...f, service: v === '_all' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Servicio" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {services.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filters.level || '_all'} onValueChange={v => setFilters(f => ({ ...f, level: v === '_all' ? '' : v as LogLevel }))}>
                <SelectTrigger><SelectValue placeholder="Nivel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>

              <Input
                placeholder="correlationId"
                value={filters.correlationId}
                onChange={e => setFilters(f => ({ ...f, correlationId: e.target.value }))}
              />

              <Input
                placeholder="Buscar en mensaje..."
                value={filters.search}
                onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
              />

              <Select value={filters.hours} onValueChange={v => setFilters(f => ({ ...f, hours: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Ultima hora</SelectItem>
                  <SelectItem value="6">Ultimas 6h</SelectItem>
                  <SelectItem value="24">Ultimas 24h</SelectItem>
                  <SelectItem value="72">Ultimas 72h</SelectItem>
                  <SelectItem value="168">Ultima semana</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-md px-4 py-3">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Count */}
        <div className="text-sm text-muted-foreground">
          {total.toLocaleString()} resultado{total !== 1 ? 's' : ''}
          {loading && ' · cargando...'}
        </div>

        {/* Table */}
        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-40">Timestamp</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-20">Nivel</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-36">Servicio</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Mensaje</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(log => (
                <>
                  <tr
                    key={log.id}
                    className="border-t border-border hover:bg-muted/30 cursor-pointer"
                    onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                  >
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap text-xs">{formatDate(log.timestamp)}</td>
                    <td className="px-3 py-2">
                      <Badge className={`text-xs ${LEVEL_BADGE[log.level]}`}>{log.level}</Badge>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground text-xs truncate max-w-[9rem]">{log.service}</td>
                    <td className="px-3 py-2 truncate max-w-xs">{log.message}</td>
                  </tr>
                  {expanded === log.id && (
                    <tr key={`${log.id}-exp`} className="border-t border-border bg-muted/20">
                      <td colSpan={4} className="px-4 py-3">
                        <LogDetail log={log} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
              {logs.length === 0 && !loading && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    Sin resultados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Pagina {page + 1} de {totalPages}
            </span>
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
      </div>
    </div>
  )
}

function LogDetail({ log }: { log: LogEntry }) {
  return (
    <div className="space-y-2 text-xs font-mono">
      {log.context && <div><span className="text-muted-foreground">context:</span> {log.context}</div>}
      {log.correlationId && <div><span className="text-muted-foreground">correlationId:</span> {log.correlationId}</div>}
      {log.traceId && <div><span className="text-muted-foreground">traceId:</span> {log.traceId}</div>}
      {log.spanId && <div><span className="text-muted-foreground">spanId:</span> {log.spanId}</div>}
      {log.stack && (
        <pre className="bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all text-red-600 dark:text-red-400">
          {log.stack}
        </pre>
      )}
      {log.meta && (
        <pre className="bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(log.meta, null, 2)}
        </pre>
      )}
    </div>
  )
}
