import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Header } from '../components/header'
import { metricsApi } from '../lib/api'
import { isoHoursAgo, formatDate } from '../lib/utils'
import type { MetricPoint, MetricsQuery } from '../types'
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { format, parseISO } from 'date-fns'

const PAGE_SIZE = 100
const COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#3b82f6', '#8b5cf6', '#ec4899']

export function MetricsPage() {
  const [points, setPoints] = useState<MetricPoint[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [names, setNames] = useState<string[]>([])
  const [services, setServices] = useState<string[]>([])

  const [filters, setFilters] = useState({
    name: '',
    service: '',
    hours: '6',
  })

  const load = useCallback(async (p = 0) => {
    setLoading(true)
    setError(null)
    try {
      const params: MetricsQuery = {
        from: isoHoursAgo(Number(filters.hours)),
        limit: PAGE_SIZE,
        offset: p * PAGE_SIZE,
        ...(filters.name ? { name: filters.name } : {}),
        ...(filters.service ? { service: filters.service } : {}),
      }
      const { data } = await metricsApi.query(params)
      setPoints(data.data)
      setTotal(data.total)
      setPage(p)
    } catch (e: any) {
      setError(e?.message || 'Error al cargar metricas')
    } finally {
      setLoading(false)
    }
  }, [filters])

  useEffect(() => {
    metricsApi.names().then(r => setNames(r.data)).catch(() => {})
    metricsApi.services().then(r => setServices(r.data)).catch(() => {})
  }, [])

  useEffect(() => { load(0) }, [load])

  // Group points by name for chart
  const grouped = points.reduce<Record<string, MetricPoint[]>>((acc, p) => {
    if (!acc[p.name]) acc[p.name] = []
    acc[p.name].push(p)
    return acc
  }, {})

  // Build time-series for chart (first metric name only)
  const chartName = filters.name || Object.keys(grouped)[0] || ''
  const chartPoints = (grouped[chartName] || [])
    .slice()
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .map(p => ({ time: format(parseISO(p.timestamp), 'HH:mm'), value: p.value, name: p.name }))

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex flex-col h-full">
      <Header title="Metricas" onRefresh={() => load(page)} refreshing={loading} />
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Select value={filters.name || '_all'} onValueChange={v => setFilters(f => ({ ...f, name: v === '_all' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Metrica" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todas</SelectItem>
                  {names.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filters.service || '_all'} onValueChange={v => setFilters(f => ({ ...f, service: v === '_all' ? '' : v }))}>
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

        {/* Chart */}
        {chartPoints.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">{chartName}</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartPoints}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="value" stroke={COLORS[0]} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Summary bar chart by name */}
        {Object.keys(grouped).length > 1 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-medium">Conteo por metrica</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={Object.entries(grouped).map(([name, pts]) => ({ name, count: pts.length }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill={COLORS[1]} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <div className="text-sm text-muted-foreground">
          {total.toLocaleString()} punto{total !== 1 ? 's' : ''}{loading && ' · cargando...'}
        </div>

        <div className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Nombre</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-36">Servicio</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">Valor</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-20">Tipo</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-40">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {points.map(p => (
                <tr key={p.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-2 font-mono text-xs">{p.name}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[9rem]">{p.service}</td>
                  <td className="px-3 py-2 text-xs font-semibold">{p.value}{p.unit ? ` ${p.unit}` : ''}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{p.type}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDate(p.timestamp)}</td>
                </tr>
              ))}
              {points.length === 0 && !loading && (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">Sin resultados</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

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
      </div>
    </div>
  )
}
