import { useEffect, useState, useCallback, useRef, ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, AlertCircle, X, ChevronLeft, ChevronRight } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import {
  appointmentsApi, issueTypesApi, cornersApi, usersApi,
  Corner, IssueType, Appointment, AppointmentStatus, AppointmentFilters, TICKET_TYPE_LABELS,
  MonolithUser, DeviceSerialSuggestion, ServiceNowNumberSuggestion,
} from '@/lib/api'
import { formatDate, cn } from '@/lib/utils'
import { useAuth } from '@/context/auth'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { useSuggestions } from '@/hooks/use-suggestions'

const STATUS_CONFIG: Record<AppointmentStatus, { label: string; className: string }> = {
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

const ALL_STATUSES: AppointmentStatus[] = [
  'CREATED', 'DELIVERED', 'IN_PROGRESS', 'PAUSED',
  'PENDING_THIRD_PARTY', 'PENDING_USER', 'PENDING_SPARE_PART',
  'PENDING_PICKUP', 'PENDING_REPLACEMENT_DELIVERY',
  'CLOSED', 'VALIDATED', 'REOPENED', 'CANCELED',
]

// Espejo de ACTIVE_STATUSES (monolith: core/domain/enums/appointment-status.enum.ts)
// — todo lo que no es terminal. Se usa como filtro por defecto para no traer
// el historial completo (potencialmente cientos de miles de citas por corner)
// cuando no se eligió un estado puntual.
const TERMINAL_STATUSES: AppointmentStatus[] = ['CLOSED', 'VALIDATED', 'CANCELED']
const ACTIVE_STATUSES: AppointmentStatus[] = ALL_STATUSES.filter((s) => !TERMINAL_STATUSES.includes(s))

export function AppointmentStatusBadge({ status }: { status: AppointmentStatus }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: '' }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', config.className)}>
      {config.label}
    </span>
  )
}

export function TicketTypeBadge({ ticketType }: { ticketType?: Appointment['ticketType'] }) {
  if (!ticketType) return <span className="text-xs text-muted-foreground">—</span>
  return <Badge variant="outline">{TICKET_TYPE_LABELS[ticketType]}</Badge>
}

/** Input con dropdown de sugerencias server-side debajo — se cierra al elegir una opción o al hacer click afuera. */
function SuggestInput<T>({
  value, onChange, placeholder, suggestions, loading, onSelect, renderItem, getKey,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  suggestions: T[]
  loading: boolean
  onSelect: (item: T) => void
  renderItem: (item: T) => ReactNode
  getKey: (item: T) => string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative" ref={containerRef}>
      <Input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className="text-sm"
        autoComplete="off"
      />
      {open && (loading || suggestions.length > 0) && (
        <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-md border bg-popover shadow-md">
          {loading ? (
            <p className="text-xs text-muted-foreground text-center py-2">Buscando...</p>
          ) : (
            suggestions.map((item) => (
              <div
                key={getKey(item)}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-muted/50"
                onClick={() => { onSelect(item); setOpen(false) }}
              >
                {renderItem(item)}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

const PAGE_SIZE = 20

export function AppointmentsPage() {
  const navigate = useNavigate()
  const { can } = useAuth()
  const [appointments, setAppointments] = useState<Appointment[]>([])
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
  const [availableOnly, setAvailableOnly] = useState(true)
  // Por defecto solo se buscan citas activas (no terminales) — evita traer el
  // historial completo del corner. Al tildarlo, se buscan todos los estados.
  const [includeHistory, setIncludeHistory] = useState(false)

  // Búsqueda en vivo: los campos de texto se aplican con debounce para no
  // disparar una petición por tecla.
  const debouncedEmail = useDebouncedValue(customerEmail)
  const debouncedSnNumber = useDebouncedValue(servicenowNumber)
  const debouncedSerial = useDebouncedValue(deviceSerial)

  // Descarta respuestas fuera de orden (la de un filtro viejo podría llegar
  // después que la del filtro actual y pisar los resultados correctos).
  const requestId = useRef(0)

  // Autocomplete: sugerencias server-side mientras se escribe en cada filtro de texto.
  const userSuggestFn = useCallback((q: string) => usersApi.search(q), [])
  const serialSuggestFn = useCallback(
    (q: string) => appointmentsApi.suggestDeviceSerial(cornerId, q),
    [cornerId],
  )
  const snNumberSuggestFn = useCallback(
    (q: string) => appointmentsApi.suggestServiceNowNumber(cornerId, q),
    [cornerId],
  )
  const userSuggestions = useSuggestions(customerEmail, userSuggestFn)
  const serialSuggestions = useSuggestions(deviceSerial, serialSuggestFn, !!cornerId)
  const snNumberSuggestions = useSuggestions(servicenowNumber, snNumberSuggestFn, !!cornerId)

  useEffect(() => {
    Promise.all([cornersApi.list(), issueTypesApi.list()])
      .then(([c, t]) => { setCorners(c); setIssueTypes(t) })
      .catch(() => setError('No se pudieron cargar los filtros'))
      .finally(() => setLoadingMeta(false))
  }, [])

  // Cambiar cualquier filtro vuelve a página 1 — si no, un filtro nuevo puede
  // pedir una página que ya no existe y mostrar "sin resultados" con datos.
  useEffect(() => {
    setPage(1)
  }, [cornerId, status, issueTypeId, debouncedEmail, debouncedSnNumber, debouncedSerial, dateFrom, dateTo, availableOnly, includeHistory])

  // Al cambiar de corner se vacía la tabla para mostrar el skeleton inicial
  useEffect(() => {
    setAppointments([])
    setTotal(0)
  }, [cornerId])

  const buildParams = useCallback((): AppointmentFilters => {
    const p: AppointmentFilters = { page, limit: PAGE_SIZE, availableOnly }
    if (cornerId) p.cornerId = cornerId
    if (status) {
      p.status = status
    } else if (!includeHistory) {
      // Sin estado puntual elegido: acotar a activas para no traer el
      // historial completo (cerradas/validadas/canceladas) del corner.
      p.status = ACTIVE_STATUSES.join(',')
    }
    if (issueTypeId) p.issueTypeId = issueTypeId
    if (debouncedEmail.trim()) p.customerEmail = debouncedEmail.trim()
    if (debouncedSnNumber.trim()) p.servicenowNumber = debouncedSnNumber.trim()
    if (debouncedSerial.trim()) p.deviceSerial = debouncedSerial.trim()
    if (dateFrom) p.dateFrom = dateFrom
    if (dateTo) p.dateTo = dateTo
    return p
  }, [page, cornerId, status, issueTypeId, debouncedEmail, debouncedSnNumber, debouncedSerial, dateFrom, dateTo, availableOnly, includeHistory])

  const loadAppointments = useCallback(async () => {
    if (!cornerId) {
      setAppointments([])
      setTotal(0)
      return
    }
    const id = ++requestId.current
    setLoading(true)
    setError('')
    try {
      const result = await appointmentsApi.listFiltered(buildParams())
      if (id !== requestId.current) return
      setAppointments(result.data)
      setTotal(result.total)
    } catch (err: unknown) {
      if (id !== requestId.current) return
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al cargar citas')
      setAppointments([])
      setTotal(0)
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [buildParams, cornerId])

  useEffect(() => {
    loadAppointments()
  }, [loadAppointments])

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
      <Header title="Citas" icon={AlertCircle} onRefresh={loadAppointments} loading={loading}>
        {can('appointment:create') && (
          <Button onClick={() => navigate('/appointments/new')}>
            <Plus className="h-4 w-4" />
            Nueva Cita
          </Button>
        )}
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
              <Label className="text-xs">Tipo de cita</Label>
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

          {/* Row 2: upn + serial + servicenow number — cada uno con autocomplete server-side */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">UPN de usuario</Label>
              <SuggestInput<MonolithUser>
                value={customerEmail}
                onChange={setCustomerEmail}
                placeholder="usuario@empresa.com"
                suggestions={userSuggestions.suggestions}
                loading={userSuggestions.loading}
                onSelect={(u) => setCustomerEmail(u.upn ?? u.email ?? '')}
                getKey={(u) => u.id}
                renderItem={(u) => (
                  <>
                    <p className="font-medium truncate">{u.fullName ?? (`${u.name ?? ''} ${u.lastName ?? ''}`.trim() || 'Sin nombre')}</p>
                    <p className="text-xs text-muted-foreground truncate">{u.upn ?? u.email ?? '—'}</p>
                  </>
                )}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Serial del dispositivo</Label>
              <SuggestInput<DeviceSerialSuggestion>
                value={deviceSerial}
                onChange={setDeviceSerial}
                placeholder={cornerId ? 'SN123456789' : 'Elegí un corner primero'}
                suggestions={serialSuggestions.suggestions}
                loading={serialSuggestions.loading}
                onSelect={(d) => setDeviceSerial(d.serialNumber)}
                getKey={(d) => d.serialNumber}
                renderItem={(d) => (
                  <>
                    <p className="font-medium font-mono truncate">{d.serialNumber}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {[d.brand, d.model].filter(Boolean).join(' ') || '—'}
                      {d.customerUpn ? ` · ${d.customerUpn}` : ''}
                    </p>
                  </>
                )}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Número ServiceNow</Label>
              <SuggestInput<ServiceNowNumberSuggestion>
                value={servicenowNumber}
                onChange={setServicenowNumber}
                placeholder={cornerId ? 'INC0001234' : 'Elegí un corner primero'}
                suggestions={snNumberSuggestions.suggestions}
                loading={snNumberSuggestions.loading}
                onSelect={(s) => setServicenowNumber(s.number)}
                getKey={(s) => s.appointmentId + s.number}
                renderItem={(s) => (
                  <>
                    <p className="font-medium font-mono truncate">{s.number}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.type}</p>
                  </>
                )}
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

            <div className="flex items-center gap-2 pb-1.5">
              <input
                type="checkbox"
                id="availableOnly"
                checked={availableOnly}
                onChange={(e) => setAvailableOnly(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="availableOnly" className="text-sm font-normal cursor-pointer">
                Solo disponibles
              </Label>
            </div>

            <div className="flex items-center gap-2 pb-1.5">
              <input
                type="checkbox"
                id="includeHistory"
                checked={includeHistory}
                onChange={(e) => setIncludeHistory(e.target.checked)}
                className="h-4 w-4 rounded border-input"
                disabled={!!status}
              />
              <Label htmlFor="includeHistory" className="text-sm font-normal cursor-pointer">
                Todas las citas
              </Label>
            </div>

            {hasFilters && (
              <div className="flex gap-2 pb-0.5">
                <Button size="sm" variant="outline" onClick={clearFilters}>
                  <X className="h-4 w-4" />
                  Limpiar
                </Button>
              </div>
            )}

            {cornerId && (
              <span className="text-sm text-muted-foreground pb-0.5 ml-auto">
                {loading ? 'Buscando…' : `${total} cita(s)`}
              </span>
            )}
          </div>
        </div>

        {/* Table */}
        {!cornerId ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Selecciona un corner para ver las citas</p>
          </div>
        ) : loading && appointments.length === 0 ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : appointments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <AlertCircle className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No se encontraron citas con los filtros aplicados</p>
            {hasFilters && (
              <Button variant="outline" className="mt-4" onClick={clearFilters}>
                <X className="h-4 w-4" />
                Limpiar filtros
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* Durante un refresco se mantienen las filas visibles, apenas atenuadas */}
            <div className={cn('border rounded-lg overflow-hidden transition-opacity', loading && 'opacity-60')}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead>Dispositivo</TableHead>
                    <TableHead>UPN</TableHead>
                    <TableHead>Fecha</TableHead>
                    <TableHead>SN Number</TableHead>
                    <TableHead>Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {appointments.map((appointment) => (
                    <TableRow
                      key={appointment.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/appointments/${appointment.id}`)}
                    >
                      <TableCell className="font-mono text-xs">
                        {appointment.id.slice(0, 8)}...
                      </TableCell>
                      <TableCell>
                        <TicketTypeBadge ticketType={appointment.ticketType} />
                      </TableCell>
                      <TableCell>
                        <AppointmentStatusBadge status={appointment.status} />
                      </TableCell>
                      <TableCell className="text-sm">
                        {appointment.technician ? (
                          <Badge variant="outline">{appointment.technician.name}</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground">Disponible</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {appointment.device?.serialNumber ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-40 truncate">
                        {appointment.customer?.upn ?? appointment.customer?.email ?? appointment.customerId?.slice(0, 8) ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(appointment.createdAt)}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {appointment.servicenowNumber ?? '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/appointments/${appointment.id}`)
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
