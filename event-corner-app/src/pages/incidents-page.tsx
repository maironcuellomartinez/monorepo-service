import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, AlertCircle, Search, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { incidentsApi, issueTypesApi, cornersApi, Corner, IssueType, Incident, IncidentStatus, IncidentFilters } from '@/lib/api'
import { formatDate, cn } from '@/lib/utils'

const STATUS_CONFIG: Record<IncidentStatus, { label: string; className: string }> = {
  CREATED:                     { label: 'Creada',               className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  DELIVERED:                   { label: 'Entregada',            className: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200' },
  IN_PROGRESS:                 { label: 'En progreso',          className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  PAUSED:                      { label: 'Pausada',              className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
  PENDING_THIRD_PARTY:         { label: 'Pend. tercero',        className: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200' },
  PENDING_USER:                { label: 'Pend. usuario',        className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  PENDING_SPARE_PART:          { label: 'Pend. repuesto',       className: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200' },
  PENDING_PICKUP:              { label: 'Pend. recogida',       className: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' },
  PENDING_REPLACEMENT_DELIVERY:{ label: 'Pend. sustitución',    className: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200' },
  CLOSED:                      { label: 'Cerrada',              className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  VALIDATED:                   { label: 'Validada',             className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200' },
  REOPENED:                    { label: 'Reabierta',            className: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200' },
  CANCELED:                    { label: 'Cancelada',            className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
}

const ALL_STATUSES: IncidentStatus[] = [
  'CREATED', 'DELIVERED', 'IN_PROGRESS', 'PAUSED',
  'PENDING_THIRD_PARTY', 'PENDING_USER', 'PENDING_SPARE_PART',
  'PENDING_PICKUP', 'PENDING_REPLACEMENT_DELIVERY',
  'CLOSED', 'VALIDATED', 'REOPENED', 'CANCELED',
]

export function IncidentStatusBadge({ status }: { status: IncidentStatus }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: '' }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', config.className)}>
      {config.label}
    </span>
  )
}

const PAGE_SIZE = 20

export function IncidentsPage() {
  const navigate = useNavigate()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [total, setTotal] = useState(0)
  const [corners, setCorners] = useState<Corner[]>([])
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingMeta, setLoadingMeta] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)

  // Filters
  const [cornerId, setCornerId] = useState<string>('')
  const [status, setStatus] = useState<string>('')
  const [issueTypeId, setIssueTypeId] = useState<string>('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [servicenowNumber, setServicenowNumber] = useState('')
  const [deviceSerial, setDeviceSerial] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    Promise.all([cornersApi.list(), issueTypesApi.list()])
      .then(([c, t]) => { setCorners(c); setIssueTypes(t) })
      .catch(() => setError('No se pudieron cargar los filtros'))
      .finally(() => setLoadingMeta(false))
  }, [])

  const buildParams = useCallback((): IncidentFilters => {
    const p: IncidentFilters = { page, limit: PAGE_SIZE, availableOnly: true }
    if (cornerId) p.cornerId = cornerId
    if (status) p.status = status
    if (issueTypeId) p.issueTypeId = issueTypeId
    if (customerEmail.trim()) p.customerEmail = customerEmail.trim()
    if (servicenowNumber.trim()) p.servicenowNumber = servicenowNumber.trim()
    if (deviceSerial.trim()) p.deviceSerial = deviceSerial.trim()
    if (dateFrom) p.dateFrom = dateFrom
    if (dateTo) p.dateTo = dateTo
    return p
  }, [page, cornerId, status, issueTypeId, customerEmail, servicenowNumber, deviceSerial, dateFrom, dateTo])

  const loadIncidents = useCallback(async () => {
    if (!cornerId) {
      setIncidents([])
      setTotal(0)
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await incidentsApi.listFiltered(buildParams())
      setIncidents(result.data)
      setTotal(result.total)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al cargar incidencias')
      setIncidents([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [buildParams, cornerId])

  useEffect(() => {
    loadIncidents()
  }, [loadIncidents])

  const applyFilters = () => {
    setPage(1)
  }

  const clearFilters = () => {
    setStatus('')
    setIssueTypeId('')
    setCustomerEmail('')
    setServicenowNumber('')
    setDeviceSerial('')
    setDateFrom('')
    setDateTo('')
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasFilters = status || issueTypeId || customerEmail || servicenowNumber || deviceSerial || dateFrom || dateTo

  return (
    <div className="flex flex-col h-full">
      <Header title="Incidencias" onRefresh={loadIncidents} loading={loading}>
        <Button onClick={() => navigate('/incidents/new')}>
          <Plus className="h-4 w-4" />
          Nueva Incidencia
        </Button>
      </Header>

      <div className="flex-1 p-6 space-y-4 overflow-auto">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Filter panel */}
        <div className="border rounded-lg p-4 space-y-4 bg-card">
          {/* Row 1: corner + status + issueType */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Corner</Label>
              <Select value={cornerId} onValueChange={(v) => { setCornerId(v); setPage(1) }} disabled={loadingMeta}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar corner..." />
                </SelectTrigger>
                <SelectContent>
                  {corners.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Estado</Label>
              <Select value={status} onValueChange={(v) => { setStatus(v === '_all' ? '' : v); setPage(1) }}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {ALL_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{STATUS_CONFIG[s].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Tipo de incidencia</Label>
              <Select value={issueTypeId} onValueChange={(v) => { setIssueTypeId(v === '_all' ? '' : v); setPage(1) }}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">Todos</SelectItem>
                  {issueTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Row 2: email + serial + servicenow number */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Email de usuario</Label>
              <Input
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="usuario@empresa.com"
                className="text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Serial del dispositivo</Label>
              <Input
                value={deviceSerial}
                onChange={(e) => setDeviceSerial(e.target.value)}
                placeholder="SN123456789"
                className="text-sm"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Número ServiceNow</Label>
              <Input
                value={servicenowNumber}
                onChange={(e) => setServicenowNumber(e.target.value)}
                placeholder="INC0001234"
                className="text-sm"
              />
            </div>
          </div>

          {/* Row 3: date range + actions */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Fecha desde</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="text-sm w-40"
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Fecha hasta</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="text-sm w-40"
              />
            </div>

            <div className="flex gap-2 pb-0.5">
              <Button size="sm" onClick={applyFilters} disabled={!cornerId}>
                <Search className="h-4 w-4" />
                Buscar
              </Button>
              {hasFilters && (
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  <X className="h-4 w-4" />
                  Limpiar
                </Button>
              )}
            </div>

            {cornerId && !loading && (
              <span className="text-sm text-muted-foreground pb-0.5 ml-auto">
                {total} incidencia(s)
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        {!cornerId ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Selecciona un corner para ver las incidencias</p>
          </div>
        ) : loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : incidents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No se encontraron incidencias con los filtros aplicados</p>
            {hasFilters && (
              <Button variant="outline" className="mt-4" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Dispositivo</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>SN Number</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidents.map((incident) => (
                    <TableRow
                      key={incident.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/incidents/${incident.id}`)}
                    >
                      <TableCell className="font-mono text-xs">
                        {incident.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <IncidentStatusBadge status={incident.status} />
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {incident.device?.serialNumber ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-40 truncate">
                        {incident.customer?.email ?? incident.customerId?.slice(0, 8) ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(incident.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {incident.servicenowNumber ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/incidents/${incident.id}`)
                            }}
                          >
                            Ver
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage(p => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= totalPages}
                    onClick={() => setPage(p => p + 1)}
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
