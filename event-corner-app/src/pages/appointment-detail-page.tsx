import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle, CheckCircle2, Monitor, Clock, History, ArrowRight } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { SlotPicker } from '@/components/slot-picker'
import { appointmentsApi, Appointment, AppointmentStatus, AppointmentTimelineEntry, AvailabilitySlot } from '@/lib/api'
import { formatDate, cn } from '@/lib/utils'
import { useAuth } from '@/context/auth'
import { AppointmentStatusBadge, TicketTypeBadge } from './appointments-page'
import { STATUS_LABELS, TIMELINE_ICON } from './dashboard-page'

const STATUS_ORDER: AppointmentStatus[] = [
  'CREATED',
  'DELIVERED',
  'IN_PROGRESS',
  'CLOSED',
  'VALIDATED',
]

export function AppointmentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [appointment, setAppointment] = useState<Appointment | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')
  const [timeline, setTimeline] = useState<AppointmentTimelineEntry[]>([])
  const [loadingTimeline, setLoadingTimeline] = useState(false)

  // Tomar una cita CLOSED la reabre y reprograma en el mismo paso —
  // hace falta elegir un horario nuevo antes de confirmar. CANCELED es
  // terminal y no puede tomarse/reabrirse.
  const [slotPickerOpen, setSlotPickerOpen] = useState(false)
  const [selectedTakeSlot, setSelectedTakeSlot] = useState<AvailabilitySlot | null>(null)

  const load = async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const data = await appointmentsApi.getById(id)
      setAppointment(data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al cargar la cita')
    } finally {
      setLoading(false)
    }

    setLoadingTimeline(true)
    appointmentsApi.getTimeline(id)
      .then(setTimeline)
      .catch(() => setTimeline([]))
      .finally(() => setLoadingTimeline(false))
  }

  useEffect(() => { load() }, [id])

  const needsNewSlot = !!appointment && appointment.status === 'CLOSED'

  const handleTakeClick = () => {
    if (needsNewSlot) {
      setSlotPickerOpen(true)
      return
    }
    handleTake()
  }

  const handleTake = async () => {
    if (!appointment || !user?.technicianId) return
    if (needsNewSlot && !selectedTakeSlot) return
    setActionLoading(true)
    setActionError('')
    try {
      await appointmentsApi.take(appointment.id, {
        technicianId: user.technicianId,
        slotIds: needsNewSlot ? selectedTakeSlot!.slotIds : undefined,
      })
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setActionError(msg || 'Error al tomar la cita')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Detalle Cita" icon={AlertCircle} />
        <div className="flex-1 p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !appointment) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Detalle Cita" icon={AlertCircle} />
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error || 'Cita no encontrada'}</AlertDescription>
          </Alert>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/appointments')}>
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </div>
      </div>
    )
  }

  const statusIdx = STATUS_ORDER.indexOf(appointment.status)
  // VALIDATED y CANCELED son terminales — no se pueden tomar. CLOSED sí:
  // tomarla la reabre y reprograma en el mismo paso (ver needsNewSlot más
  // arriba), no hace falta un botón "Reabrir" aparte.
  const canTake =
    !appointment.currentTechnicianId &&
    !!user?.technicianId &&
    appointment.status !== 'VALIDATED' &&
    appointment.status !== 'CANCELED'

  return (
    <div className="flex flex-col h-full">
      <Header title={`Cita ${appointment.servicenowNumber ?? appointment.id.slice(0, 8)}`} icon={AlertCircle} onRefresh={load} loading={loading}>
        <Button variant="outline" size="sm" onClick={() => navigate('/appointments')}>
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Button>
      </Header>

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {actionError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        )}

        {/* Status timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estado actual</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {STATUS_ORDER.map((s, i) => (
                <div key={s} className="flex items-center gap-1 shrink-0">
                  <div className="flex flex-col items-center gap-1">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2',
                        i < statusIdx
                          ? 'bg-primary border-primary text-primary-foreground'
                          : i === statusIdx
                          ? 'bg-primary border-primary text-primary-foreground ring-4 ring-primary/20'
                          : 'bg-background border-muted text-muted-foreground',
                      )}
                    >
                      {i < statusIdx ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                    </div>
                    <span className={cn('text-xs', i <= statusIdx ? 'font-medium' : 'text-muted-foreground')}>
                      {s === 'CREATED' ? 'Creada'
                        : s === 'DELIVERED' ? 'Entregada'
                        : s === 'IN_PROGRESS' ? 'En progreso'
                        : s === 'CLOSED' ? 'Cerrada'
                        : 'Validada'}
                    </span>
                  </div>
                  {i < STATUS_ORDER.length - 1 && (
                    <div className={cn('h-0.5 w-6 mb-4', i < statusIdx ? 'bg-primary' : 'bg-muted')} />
                  )}
                </div>
              ))}
              {appointment.status === 'REOPENED' && (
                <Badge variant="destructive" className="ml-2">REABIERTA</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Main info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Información general</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow label="ID" value={<code className="font-mono text-xs">{appointment.id}</code>} />
              {appointment.issueId != null && (
                <InfoRow label="Issue ID" value={<code className="font-mono text-xs">{appointment.issueId}</code>} />
              )}
              <InfoRow label="Estado" value={<AppointmentStatusBadge status={appointment.status} />} />
              <InfoRow label="Tipo de ticket" value={<TicketTypeBadge ticketType={appointment.ticketType} />} />
              <InfoRow label="Corner" value={appointment.corner?.name ?? appointment.cornerId} />
              <InfoRow label="Tipo" value={appointment.issueType?.name ?? appointment.issueTypeId} />
              <InfoRow label="Email cliente" value={appointment.customer?.email ?? appointment.customerId} />
              {appointment.technician && (
                <InfoRow label="Técnico" value={appointment.technician.name} />
              )}
              <InfoRow label="Creada" value={formatDate(appointment.createdAt)} />
              <InfoRow label="Actualizada" value={formatDate(appointment.updatedAt)} />
              {appointment.scheduledRange && (
                <>
                  <InfoRow label="Inicio programado" value={formatDate(appointment.scheduledRange.start)} />
                  <InfoRow label="Fin programado" value={formatDate(appointment.scheduledRange.end)} />
                </>
              )}
              {appointment.notes && <InfoRow label="Notas" value={appointment.notes} />}
            </CardContent>
          </Card>

          {/* Status history */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-4 w-4" />
                Historial de estados {timeline.length > 0 && `(${timeline.length})`}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingTimeline ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
                </div>
              ) : timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Sin historial disponible</p>
              ) : (
                <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                  {[...timeline].reverse().map((entry) => {
                    const Icon = TIMELINE_ICON[entry.actionType] ?? Clock
                    const label = STATUS_LABELS[entry.actionType] ?? entry.actionType
                    return (
                      <div key={entry.activityId} className="flex gap-2.5 p-2 rounded-lg hover:bg-muted/50 text-sm">
                        <div className="mt-0.5 shrink-0">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="font-medium text-xs">{label}</span>
                              {entry.technicianName && (
                                <span className="text-xs text-muted-foreground truncate">— {entry.technicianName}</span>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0">{formatDate(entry.createdAt)}</span>
                          </div>
                          {entry.fromStatus && entry.toStatus ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                              <span>{STATUS_LABELS[entry.fromStatus] ?? entry.fromStatus}</span>
                              <ArrowRight className="h-3 w-3" />
                              <span>{STATUS_LABELS[entry.toStatus] ?? entry.toStatus}</span>
                            </div>
                          ) : entry.toStatus && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Estado: {STATUS_LABELS[entry.toStatus] ?? entry.toStatus}
                            </div>
                          )}
                          {entry.comment && (
                            <p className="text-xs text-muted-foreground mt-0.5 italic">"{entry.comment}"</p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ServiceNow info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ServiceNow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow
                label="SN Number"
                value={appointment.servicenowNumber
                  ? <span className="font-mono font-semibold">{appointment.servicenowNumber}</span>
                  : <span className="text-muted-foreground">Pendiente</span>}
              />
              <InfoRow
                label="SN ID (sys_id)"
                value={appointment.servicenowId
                  ? <code className="font-mono text-xs">{appointment.servicenowId}</code>
                  : <span className="text-muted-foreground">—</span>}
              />
              {appointment.snowqCorrelationId && (
                <Alert>
                  <AlertDescription className="text-xs">
                    Correlation ID pendiente de reconciliar: <code className="font-mono">{appointment.snowqCorrelationId}</code>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Device info */}
          {(appointment.device || appointment.deviceId) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Dispositivo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {appointment.device ? (
                  <>
                    <InfoRow label="Serial" value={<code className="font-mono text-xs font-semibold">{appointment.device.serialNumber}</code>} />
                    {appointment.device.brand && appointment.device.model && (
                      <InfoRow label="Nombre" value={`${appointment.device.brand} ${appointment.device.model}`} />
                    )}
                    {appointment.device.brand && !appointment.device.model && (
                      <InfoRow label="Marca" value={appointment.device.brand} />
                    )}
                    {appointment.device.model && !appointment.device.brand && (
                      <InfoRow label="Modelo" value={appointment.device.model} />
                    )}
                  </>
                ) : (
                  <InfoRow label="ID" value={<code className="font-mono text-xs">{appointment.deviceId}</code>} />
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Actions — Tomar (reabre y reprograma automáticamente si está CLOSED) */}
        {canTake && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {actionError && !slotPickerOpen && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{actionError}</AlertDescription>
                </Alert>
              )}

              <Button onClick={handleTakeClick} disabled={actionLoading}>
                {actionLoading ? 'Tomando...' : 'Tomar cita'}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {needsNewSlot && (
        <Dialog open={slotPickerOpen} onOpenChange={(open) => { if (!open && !actionLoading) { setSlotPickerOpen(false); setSelectedTakeSlot(null); setActionError('') } }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Reabrir y tomar cita</DialogTitle>
              <DialogDescription>
                Esta cita está {appointment.status === 'CLOSED' ? 'cerrada' : 'cancelada'} — elegí un horario nuevo para reabrirla y tomarla.
              </DialogDescription>
            </DialogHeader>

            {actionError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{actionError}</AlertDescription>
              </Alert>
            )}

            <SlotPicker
              cornerId={appointment.cornerId}
              duration={appointment.durationMinutes ?? 60}
              selectedSlot={selectedTakeSlot}
              onSelect={setSelectedTakeSlot}
            />

            <DialogFooter>
              <Button
                variant="outline"
                disabled={actionLoading}
                onClick={() => { setSlotPickerOpen(false); setSelectedTakeSlot(null); setActionError('') }}
              >
                Cancelar
              </Button>
              <Button disabled={!selectedTakeSlot || actionLoading} onClick={handleTake}>
                {actionLoading ? 'Tomando...' : 'Confirmar y tomar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground min-w-32 shrink-0">{label}:</span>
      <span className="flex-1 break-words">{value}</span>
    </div>
  )
}
