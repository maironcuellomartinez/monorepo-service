import { useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar as CalendarIcon, AlertCircle, Users, CheckCircle2, XCircle, Globe, Clock, Search, User, Monitor, RefreshCw } from 'lucide-react'
import { Calendar, dateFnsLocalizer, Views, View } from 'react-big-calendar'
import {
  format,
  parse,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  getDay,
  setHours,
  setMinutes,
  setSeconds,
  eachDayOfInterval,
} from 'date-fns'
import { es } from 'date-fns/locale'
import 'react-big-calendar/lib/css/react-big-calendar.css'

import { useUserSearch } from '@/hooks/use-user-search'
import { Header } from '@/components/header'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  cornersApi, availabilityApi, usersApi, issueTypesApi, incidentsApi, devicesApi,
  Corner, AvailabilitySlot, MonolithUser, IssueType, Incident, DeviceSummary,
} from '@/lib/api'
import { cn, formatDate } from '@/lib/utils'

// ─── react-big-calendar localizer ───────────────────────────────────────────

const locales = { es }

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { locale: es }),
  getDay,
  locales,
})

const messages = {
  today: 'Hoy',
  previous: '‹',
  next: '›',
  day: 'Día',
  week: 'Semana',
  month: 'Mes',
  agenda: 'Agenda',
  date: 'Fecha',
  time: 'Hora',
  event: 'Slot',
  noEventsInRange: 'Sin slots para este período',
  showMore: (total: number) => `+${total} más`,
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface SlotEvent {
  title: string
  start: Date
  end: Date
  resource: AvailabilitySlot
}

// Límite inferior visual por defecto (06:00). Si hay slots más tempranos en
// hora local (ej. corner en otro timezone), la ventana se expande para
// mostrarlos — nunca se ocultan slots reales, ocupados o no.
const DEFAULT_MIN_HOUR = 6
const MAX_TIME = setSeconds(setMinutes(setHours(new Date(2000, 0, 1), 23), 59), 59)

// ─── Custom event card ───────────────────────────────────────────────────────

function SlotEventCard({ event }: { event: SlotEvent }) {
  const slot = event.resource
  if (!slot.available) {
    return (
      <div className="flex items-center gap-1 text-xs px-1 truncate">
        <XCircle className="h-3 w-3 shrink-0" />
        <span>Ocupado</span>
        {slot.technicians && (
          <span className="ml-auto opacity-75">
            {slot.technicians.available}/{slot.technicians.total}
          </span>
        )}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1 text-xs px-1 truncate">
      <CheckCircle2 className="h-3 w-3 shrink-0" />
      <span>Disponible</span>
      {slot.technicians && (
        <span className="ml-auto flex items-center gap-0.5">
          <Users className="h-3 w-3" />
          {slot.technicians.available}/{slot.technicians.total}
        </span>
      )}
    </div>
  )
}

// ─── Create Incident Modal ───────────────────────────────────────────────────

interface CreateIncidentModalProps {
  open: boolean
  onClose: () => void
  corner: Corner | undefined
  slot: AvailabilitySlot
  onCreated: (incident: Incident) => void
}

function CreateIncidentModal({ open, onClose, corner, slot, onCreated }: CreateIncidentModalProps) {
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([])
  const [devices, setDevices] = useState<DeviceSummary[]>([])
  const [selectedUser, setSelectedUser] = useState<MonolithUser | null>(null)
  const [selectedDevice, setSelectedDevice] = useState<DeviceSummary | null>(null)
  const [selectedIssueTypeId, setSelectedIssueTypeId] = useState('')
  const [manualSerial, setManualSerial] = useState('')
  const [notes, setNotes] = useState('')
  const { query: userSearch, setQuery: setUserSearch, results: filteredUsers, loading: loadingUsers, reset: resetUserSearch } = useUserSearch(usersApi.search)
  const [deviceSearch, setDeviceSearch] = useState('')
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [loadingIssueTypes, setLoadingIssueTypes] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Ventana real a reservar: el calendario muestra slots de 15 min, pero la cita
  // debe durar issueType.workMinutes — al elegir el tipo se re-consulta la
  // disponibilidad con esa duración y se reservan los slots consecutivos
  // necesarios a partir del horario clickeado.
  const [bookingWindow, setBookingWindow] = useState<AvailabilitySlot | null>(null)
  const [loadingWindow, setLoadingWindow] = useState(false)
  const [windowError, setWindowError] = useState('')

  // Reset state + load issue types when modal opens
  useEffect(() => {
    if (!open) return
    setSelectedUser(null)
    setSelectedDevice(null)
    setDevices([])
    setSelectedIssueTypeId('')
    setManualSerial('')
    setNotes('')
    resetUserSearch()
    setDeviceSearch('')
    setError('')
    setBookingWindow(null)
    setWindowError('')

    setLoadingIssueTypes(true)
    issueTypesApi.list({ category: 'ISSUE' })
      .then((data) => setIssueTypes(data.filter((it) => it.isActive !== false)))
      .catch(() => setError('Error al cargar tipos de incidencia'))
      .finally(() => setLoadingIssueTypes(false))

    setTimeout(() => searchRef.current?.focus(), 100)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Al elegir el tipo, verificar que desde el horario clickeado haya
  // workMinutes de disponibilidad consecutiva y obtener sus slotIds.
  useEffect(() => {
    if (!open || !selectedIssueTypeId || !corner) {
      setBookingWindow(null)
      setWindowError('')
      return
    }
    const issueType = issueTypes.find((it) => it.id === selectedIssueTypeId)
    const duration = issueType?.workMinutes ?? 60
    setLoadingWindow(true)
    setWindowError('')
    setBookingWindow(null)
    availabilityApi
      .getSlots(corner.id, slot.startTime.slice(0, 10), duration)
      .then((windows) => {
        const w = windows.find((x) => x.startTime === slot.startTime)
        if (w?.available) {
          setBookingWindow(w)
        } else {
          setWindowError(
            `Este tipo de incidencia requiere ${duration} min y no hay disponibilidad consecutiva a partir de este horario. Elegí otro slot del calendario.`,
          )
        }
      })
      .catch(() => setWindowError('No se pudo verificar la disponibilidad para la duración del tipo elegido'))
      .finally(() => setLoadingWindow(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedIssueTypeId])

  // Load devices when a customer is selected — sync from Minerva first, then read local DB
  const loadDevices = async (userId: string) => {
    setLoadingDevices(true)
    setSelectedDevice(null)
    setManualSerial('')
    setDeviceSearch('')
    try {
      await devicesApi.syncForUser(userId).catch(() => {})
      const data = await devicesApi.listByUser(userId)
      setDevices(data)
    } catch {
      setDevices([])
    } finally {
      setLoadingDevices(false)
    }
  }

  useEffect(() => {
    if (!selectedUser) {
      setDevices([])
      setSelectedDevice(null)
      setManualSerial('')
      return
    }
    loadDevices(selectedUser.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser])

  const filteredDevices = devices.filter((d) => {
    if (!deviceSearch.trim()) return true
    const q = deviceSearch.toLowerCase()
    return (
      d.serialNumber.toLowerCase().includes(q) ||
      d.model?.toLowerCase().includes(q) ||
      d.brand?.toLowerCase().includes(q) ||
      d.deviceType?.toLowerCase().includes(q)
    )
  })

  const serial = selectedDevice?.serialNumber ?? manualSerial.trim()

  const handleSubmit = async () => {
    if (!selectedUser || !selectedIssueTypeId) {
      setError('Usuario y tipo de incidencia son obligatorios')
      return
    }
    if (!selectedUser.companyId) {
      setError('Este usuario no tiene empresa asignada y no puede crear incidencias.')
      return
    }
    if (!serial) {
      setError('El número de serie del dispositivo es obligatorio')
      return
    }
    if (!bookingWindow) {
      setError('No hay disponibilidad para la duración del tipo elegido en este horario')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const incident = await incidentsApi.create({
        cornerId: corner!.id,
        issueTypeId: selectedIssueTypeId,
        customerId: selectedUser.id,
        slotIds: bookingWindow.slotIds,
        startTime: bookingWindow.startTime,
        endTime: bookingWindow.endTime,
        origin: 'event-corner-app',
        notes: notes.trim() || undefined,
        device: { serialNumber: serial },
      })
      onCreated(incident)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al crear la incidencia')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="shrink-0">
          <DialogTitle>Crear incidencia</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 overflow-y-auto flex-1 pr-1">

          {/* Slot info — readonly */}
          <div className="bg-muted/60 rounded-lg p-3 space-y-1 text-sm shrink-0">
            <div className="flex items-center gap-2 font-medium">
              <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
              {corner?.name ?? '—'}
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Clock className="h-4 w-4 shrink-0" />
              {formatDate((bookingWindow ?? slot).startTime)} → {formatDate((bookingWindow ?? slot).endTime)}
              {bookingWindow && bookingWindow.endTime !== slot.endTime && (
                <span className="text-xs">(duración según tipo de incidencia)</span>
              )}
            </div>
            {slot.technicians && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4 shrink-0" />
                {slot.technicians.available} técnico(s) disponible(s)
              </div>
            )}
          </div>

          {error && (
            <Alert variant="destructive" className="shrink-0">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Customer */}
          <div className="space-y-2 shrink-0">
            <Label>Usuario <span className="text-destructive">*</span></Label>
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                ref={searchRef}
                className="pl-9"
                placeholder="Buscar por nombre o email..."
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value)
                  setSelectedUser(null)
                }}
              />
            </div>
            {loadingUsers ? (
              <p className="text-sm text-muted-foreground text-center py-3">Buscando...</p>
            ) : (
              <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                {filteredUsers.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-3">
                    {userSearch.trim().length < 2 ? 'Escribí al menos 2 caracteres para buscar' : 'Sin resultados'}
                  </p>
                ) : filteredUsers.map((u) => (
                  <div
                    key={u.id}
                    onClick={() => setSelectedUser(u)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors text-sm',
                      selectedUser?.id === u.id ? 'bg-primary/10' : 'hover:bg-muted/50',
                    )}
                  >
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        {u.fullName ?? (`${u.name ?? ''} ${u.lastName ?? ''}`.trim() || 'Sin nombre')}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{u.email ?? u.principalName ?? '—'}</p>
                    </div>
                    {selectedUser?.id === u.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                ))}
              </div>
            )}
            {selectedUser && !selectedUser.companyId && (
              <p className="text-xs font-medium text-destructive">
                Este usuario no tiene empresa asignada y no puede crear incidencias.
              </p>
            )}
          </div>

          {/* Device — required, auto-loads after customer selection */}
          <div className="space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <Label>
                Dispositivo <span className="text-destructive">*</span>
              </Label>
              {selectedUser && (
                <button
                  type="button"
                  disabled={loadingDevices}
                  onClick={() => loadDevices(selectedUser.id)}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn('h-3 w-3', loadingDevices && 'animate-spin')} />
                  Actualizar
                </button>
              )}
            </div>
            {!selectedUser ? (
              <p className="text-xs text-muted-foreground">Seleccioná un cliente para ver sus dispositivos.</p>
            ) : loadingDevices ? (
              <p className="text-sm text-muted-foreground py-2">Sincronizando con inventario...</p>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar por modelo, marca o número de serie..."
                    value={deviceSearch}
                    onChange={(e) => {
                      setDeviceSearch(e.target.value)
                      setSelectedDevice(null)
                      setManualSerial('')
                    }}
                  />
                </div>
                <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                  {filteredDevices.length > 0 ? (
                    filteredDevices.map((d) => (
                      <div
                        key={d.id}
                        onClick={() => { setSelectedDevice(selectedDevice?.id === d.id ? null : d); setManualSerial('') }}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors text-sm',
                          selectedDevice?.id === d.id ? 'bg-primary/10' : 'hover:bg-muted/50',
                        )}
                      >
                        <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">
                            {[d.brand, d.model].filter(Boolean).join(' ') || d.deviceType || 'Dispositivo'}
                          </p>
                          <p className="text-xs text-muted-foreground font-mono">{d.serialNumber}</p>
                        </div>
                        {selectedDevice?.id === d.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                      </div>
                    ))
                  ) : deviceSearch.trim() ? (
                    /* No coincide con ningún dispositivo → ofrecer usar el texto como serial */
                    <div
                      onClick={() => { setManualSerial(deviceSearch.trim()); setSelectedDevice(null) }}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors text-sm',
                        manualSerial === deviceSearch.trim() ? 'bg-primary/10' : 'hover:bg-muted/50',
                      )}
                    >
                      <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium font-mono truncate">{deviceSearch.trim()}</p>
                        <p className="text-xs text-muted-foreground">Usar como número de serie</p>
                      </div>
                      {manualSerial === deviceSearch.trim() && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      Sin dispositivos. Escribí el número de serie para ingresarlo manualmente.
                    </p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Issue Type */}
          <div className="space-y-2 shrink-0">
            <Label>Tipo de incidencia <span className="text-destructive">*</span></Label>
            {loadingIssueTypes ? (
              <p className="text-sm text-muted-foreground">Cargando...</p>
            ) : (
              <Select value={selectedIssueTypeId} onValueChange={setSelectedIssueTypeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar tipo..." />
                </SelectTrigger>
                <SelectContent>
                  {issueTypes.map((it) => (
                    <SelectItem key={it.id} value={it.id}>
                      {it.name}{it.workMinutes ? ` (${it.workMinutes} min)` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {loadingWindow && (
              <p className="text-xs text-muted-foreground">Verificando disponibilidad para la duración del tipo...</p>
            )}
            {windowError && (
              <p className="text-xs font-medium text-destructive">{windowError}</p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-2 shrink-0">
            <Label>Notas <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
            <Textarea
              placeholder="Descripción del problema, detalles relevantes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>

        </div>

        {/* Footer */}
        <div className="flex gap-2 shrink-0 pt-2 border-t">
          <Button variant="outline" className="flex-1" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            className="flex-1"
            onClick={handleSubmit}
            disabled={
              submitting || !selectedUser || !selectedUser.companyId ||
              !selectedIssueTypeId || !serial || loadingWindow || !bookingWindow
            }
          >
            {submitting ? 'Creando...' : 'Crear incidencia'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Success Modal ────────────────────────────────────────────────────────────

interface SuccessModalProps {
  incident: Incident
  onClose: () => void
  onViewIncident: () => void
}

function SuccessModal({ incident, onClose, onViewIncident }: SuccessModalProps) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            Incidencia creada
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="bg-muted rounded-lg p-3 space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">ID:</span>
              <code className="font-mono text-xs">{incident.id.slice(0, 8)}...</code>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Estado:</span>
              <Badge>{incident.status}</Badge>
            </div>
            {incident.servicenowNumber && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">SN Number:</span>
                <code className="font-mono text-xs">{incident.servicenowNumber}</code>
              </div>
            )}
            {incident.snowqCorrelationId && (
              <p className="text-xs text-muted-foreground pt-1">
                Encolado en ServiceNow. El número SN se asignará al procesarse.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>
              Cerrar
            </Button>
            <Button className="flex-1" onClick={onViewIncident}>
              Ver incidencia
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function AvailabilityPage() {
  const navigate = useNavigate()

  const [corners, setCorners] = useState<Corner[]>([])
  const [selectedCornerId, setSelectedCornerId] = useState('')
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingCorners, setLoadingCorners] = useState(true)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>(Views.WEEK)
  const [calendarDate, setCalendarDate] = useState(new Date())

  // Modal state
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [createdIncident, setCreatedIncident] = useState<Incident | null>(null)

  // ── Load corners and auto-select first ──────────────────────────────
  useEffect(() => {
    cornersApi
      .list()
      .then((data) => {
        const active = data.filter((c) => c.isActive)
        setCorners(active)
        if (active.length > 0) setSelectedCornerId(active[0].id)
      })
      .catch(() => setError('Error al cargar corners'))
      .finally(() => setLoadingCorners(false))
  }, [])

  // ── Get list of date strings for the current view ────────────────────────
  const getDateRange = useCallback(
    (date: Date, v: View): string[] => {
      if (v === Views.DAY) {
        return [format(date, 'yyyy-MM-dd')]
      }
      if (v === Views.WEEK) {
        return eachDayOfInterval({
          start: startOfWeek(date, { locale: es }),
          end: endOfWeek(date, { locale: es }),
        }).map((d) => format(d, 'yyyy-MM-dd'))
      }
      if (v === Views.MONTH) {
        return eachDayOfInterval({
          start: startOfMonth(date),
          end: endOfMonth(date),
        }).map((d) => format(d, 'yyyy-MM-dd'))
      }
      return [format(date, 'yyyy-MM-dd')]
    },
    [],
  )

  // ── Auto-load when corner / date / view changes ──────────────────────────
  useEffect(() => {
    if (!selectedCornerId) return

    const controller = new AbortController()
    const { signal } = controller

    setLoading(true)
    setError('')

    const dates = getDateRange(calendarDate, view)

    const BATCH_SIZE = 5
    const batches: string[][] = []
    for (let i = 0; i < dates.length; i += BATCH_SIZE) {
      batches.push(dates.slice(i, i + BATCH_SIZE))
    }

    ;(async () => {
      const all: AvailabilitySlot[] = []
      try {
        for (const batch of batches) {
          if (signal.aborted) return
          const results = await Promise.all(
            batch.map((d) =>
              availabilityApi
                .getSlots(selectedCornerId, d, 15, signal)
                .catch(() => [] as AvailabilitySlot[]),
            ),
          )
          all.push(...results.flat())
        }
        if (!signal.aborted) setSlots(all)
      } catch {
        if (!signal.aborted) setError('Error al cargar disponibilidad')
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [selectedCornerId, calendarDate, view, getDateRange])

  // ── Filter out past slots ────────────────────────────────────────────────
  // No se filtra por hora: ocultar slots (ej. antes de las 6 AM locales cuando
  // el corner opera en otro timezone) hacía invisibles franjas ya reservadas.
  const now = new Date()
  const visibleSlots = slots.filter((s) => new Date(s.endTime) > now)

  // Ventana visual: arranca a las 06:00 o antes si hay slots más tempranos
  const minHour = visibleSlots.reduce(
    (min, s) => Math.min(min, new Date(s.startTime).getHours()),
    DEFAULT_MIN_HOUR,
  )
  const minTime = setSeconds(setMinutes(setHours(new Date(2000, 0, 1), minHour), 0), 0)

  // ── Map to calendar events ───────────────────────────────────────────────
  const events: SlotEvent[] = visibleSlots.map((slot) => ({
    title: slot.available ? 'Disponible' : 'Ocupado',
    start: new Date(slot.startTime),
    end: new Date(slot.endTime),
    resource: slot,
  }))

  // ── Event styling ────────────────────────────────────────────────────────
  const eventPropGetter = useCallback((event: SlotEvent) => {
    const available = event.resource.available
    return {
      style: {
        backgroundColor: available ? '#16a34a' : '#9ca3af',
        borderColor: available ? '#15803d' : '#6b7280',
        color: 'white',
        borderRadius: '6px',
        border: '1px solid',
        cursor: available ? 'pointer' : 'default',
        opacity: available ? 1 : 0.65,
      },
    }
  }, [])

  // ── Click on available slot → open modal ────────────────────────────────
  const handleSelectEvent = useCallback(
    (event: SlotEvent) => {
      if (!event.resource.available) return
      setSelectedSlot(event.resource)
    },
    [],
  )

  // ── Derived ──────────────────────────────────────────────────────────────
  const corner = corners.find((c) => c.id === selectedCornerId)
  const availableCount = visibleSlots.filter((s) => s.available).length
  const occupiedCount = visibleSlots.filter((s) => !s.available).length

  return (
    <div className="flex flex-col h-full">
      <Header title="Disponibilidad" />

      <div className="flex-1 p-6 flex flex-col gap-3 overflow-auto min-h-0">

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!selectedCornerId && !loadingCorners && (
          <div className="flex flex-col items-center justify-center flex-1 text-center">
            <CalendarIcon className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No hay corners disponibles</p>
          </div>
        )}

        {(selectedCornerId || loadingCorners) && (
          <div className="flex flex-col gap-3 flex-1 min-h-0">

            {/* Toolbar */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Label className="text-sm whitespace-nowrap">Corner:</Label>
                <Select
                  value={selectedCornerId}
                  onValueChange={setSelectedCornerId}
                  disabled={loadingCorners}
                >
                  <SelectTrigger className="h-8 w-48 text-sm">
                    <SelectValue placeholder="Seleccionar..." />
                  </SelectTrigger>
                  <SelectContent>
                    {corners.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {loading ? (
                <span className="text-sm text-muted-foreground animate-pulse">Cargando...</span>
              ) : (
                <>
                  <Badge className="bg-green-600 hover:bg-green-700 text-white gap-1.5 py-1 px-3">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {availableCount} disponibles
                  </Badge>
                  <Badge variant="secondary" className="gap-1.5 py-1 px-3">
                    <XCircle className="h-3.5 w-3.5" />
                    {occupiedCount} ocupados
                  </Badge>
                </>
              )}

              <div className="ml-auto flex flex-col items-end gap-0.5">
                {corner?.timezone && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Globe className="h-3 w-3" />
                    Zona horaria: <strong>{corner.timezone}</strong>
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  Click en un slot verde para crear una incidencia
                </span>
              </div>
            </div>

            {/* Calendar */}
            <div
              className="availability-calendar rounded-lg border bg-card overflow-hidden flex-1"
              style={{ minHeight: 600 }}
            >
              <Calendar<SlotEvent>
                localizer={localizer}
                events={events}
                date={calendarDate}
                view={view}
                onView={setView}
                onNavigate={setCalendarDate}
                views={[Views.DAY, Views.WEEK, Views.MONTH]}
                defaultView={Views.WEEK}
                min={minTime}
                max={MAX_TIME}
                step={15}
                timeslots={1}
                scrollToTime={new Date()}
                messages={messages}
                culture="es"
                eventPropGetter={eventPropGetter}
                onSelectEvent={handleSelectEvent}
                components={{ event: SlotEventCard }}
                selectable={false}
                formats={{
                  timeGutterFormat: (date: Date) => format(date, 'HH:mm'),
                  eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
                    `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`,
                  dayHeaderFormat: (date: Date) =>
                    format(date, "EEEE d 'de' MMMM", { locale: es }),
                  monthHeaderFormat: (date: Date) =>
                    format(date, "MMMM yyyy", { locale: es }),
                }}
                popup
              />
            </div>
          </div>
        )}
      </div>

      {/* Create Incident Modal */}
      {selectedSlot && (
        <CreateIncidentModal
          open={!!selectedSlot}
          onClose={() => setSelectedSlot(null)}
          corner={corner}
          slot={selectedSlot}
          onCreated={(incident) => {
            setSelectedSlot(null)
            setCreatedIncident(incident)
          }}
        />
      )}

      {/* Success Modal */}
      {createdIncident && (
        <SuccessModal
          incident={createdIncident}
          onClose={() => setCreatedIncident(null)}
          onViewIncident={() => {
            setCreatedIncident(null)
            navigate(`/incidents/${createdIncident.id}`)
          }}
        />
      )}

      {/* Scoped calendar CSS overrides */}
      <style>{`
        .availability-calendar .rbc-toolbar {
          padding: 12px 16px;
          border-bottom: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
          margin-bottom: 0;
          background: hsl(var(--card, 0 0% 100%));
          flex-wrap: wrap;
          gap: 8px;
        }
        .availability-calendar .rbc-toolbar button {
          color: hsl(var(--foreground, 222.2 84% 4.9%));
          border: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
          border-radius: 6px;
          padding: 4px 10px;
          font-size: 13px;
          background: transparent;
          cursor: pointer;
          transition: background 0.15s;
        }
        .availability-calendar .rbc-toolbar button:hover {
          background: hsl(var(--accent, 210 40% 96.1%));
        }
        .availability-calendar .rbc-toolbar button.rbc-active {
          background: hsl(var(--primary, 222.2 47.4% 11.2%));
          color: hsl(var(--primary-foreground, 210 40% 98%));
          border-color: transparent;
        }
        .availability-calendar .rbc-time-view,
        .availability-calendar .rbc-day-bg,
        .availability-calendar .rbc-month-view {
          background: hsl(var(--card, 0 0% 100%));
        }
        .availability-calendar .rbc-time-header {
          background: hsl(var(--muted, 210 40% 96.1%));
        }
        .availability-calendar .rbc-time-content {
          border-top: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
        }
        .availability-calendar .rbc-timeslot-group {
          border-bottom: 1px solid hsl(var(--border, 214.3 31.8% 91.4% / 0.5));
        }
        .availability-calendar .rbc-time-slot {
          min-height: 32px;
          color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
          font-size: 12px;
        }
        .availability-calendar .rbc-current-time-indicator {
          background: hsl(var(--primary, 222.2 47.4% 11.2%));
        }
        .availability-calendar .rbc-event:focus {
          outline: none;
        }
        .availability-calendar .rbc-label {
          font-size: 12px;
          color: hsl(var(--muted-foreground, 215.4 16.3% 46.9%));
        }
        .availability-calendar .rbc-header {
          font-size: 13px;
          font-weight: 500;
          padding: 8px 4px;
          border-bottom: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
        }
        .availability-calendar .rbc-month-row {
          border-top: 1px solid hsl(var(--border, 214.3 31.8% 91.4%));
        }
        .availability-calendar .rbc-off-range-bg {
          background: hsl(var(--muted, 210 40% 96.1%) / 0.4);
        }
        .availability-calendar .rbc-today {
          background: hsl(var(--accent, 210 40% 96.1%) / 0.5);
        }
      `}</style>
    </div>
  )
}
