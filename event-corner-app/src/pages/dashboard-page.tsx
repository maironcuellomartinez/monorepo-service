import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  MapPin, Tag, AlertCircle, ClipboardList, Plus, Info, Monitor,
  RefreshCw, Calendar, ChevronRight, Clock, CheckCircle2,
  ArrowRight, ArrowLeft, Zap, XCircle, RotateCcw, ThumbsUp,
  Wrench, Inbox, MessageSquare, History, Send, LogIn,
} from 'lucide-react'
import { Header } from '@/components/header'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import {
  cornersApi, issueTypesApi, availabilityApi, incidentsApi, devicesApi, requestsApi,
  Corner, IssueType, AvailabilitySlot, Incident, IncidentStatus, DeviceSummary, ServiceRequest,
  IncidentTimelineEntry,
} from '@/lib/api'
import { formatDate, cn } from '@/lib/utils'
import { useAuth } from '@/context/auth'
import { IncidentStatusBadge } from './incidents-page'

// ── Statuses considered "active" ──────────────────────────────────────────

const ACTIVE_STATUSES = new Set<IncidentStatus>([
  'CREATED', 'DELIVERED', 'IN_PROGRESS', 'PAUSED', 'REOPENED',
  'PENDING_THIRD_PARTY', 'PENDING_USER', 'PENDING_SPARE_PART',
  'PENDING_PICKUP', 'PENDING_REPLACEMENT_DELIVERY',
])

// ── Create Incident Modal ──────────────────────────────────────────────────
// Steps: setup (corner + issue type) → schedule (slot picker / auto) → confirm

type CreateStep = 'setup' | 'schedule' | 'confirm' | 'done'

interface CreateIncidentModalProps {
  device: DeviceSummary | null
  open: boolean
  onClose: () => void
  onCreated: (incident: Incident) => void
}

function CreateIncidentModal({ device, open, onClose, onCreated }: CreateIncidentModalProps) {
  const { user } = useAuth()

  const [step, setStep] = useState<CreateStep>('setup')
  const [corners, setCorners] = useState<Corner[]>([])
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([])
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])

  const [cornerId, setCornerId] = useState('')
  const [issueTypeId, setIssueTypeId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [autoDate, setAutoDate] = useState('')
  const [notes, setNotes] = useState('')

  const [loadingData, setLoadingData] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [loadingAuto, setLoadingAuto] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdIncident, setCreatedIncident] = useState<Incident | null>(null)

  // Reset and load on open
  useEffect(() => {
    if (!open) return
    setStep('setup')
    setCornerId('')
    setIssueTypeId('')
    setDate(new Date().toISOString().slice(0, 10))
    setSelectedSlot(null)
    setAutoDate('')
    setNotes('')
    setSlots([])
    setError('')
    setCreatedIncident(null)

    setLoadingData(true)
    Promise.all([cornersApi.list(), issueTypesApi.list()])
      .then(([c, it]) => {
        setCorners(c.filter((x) => x.isActive))
        setIssueTypes(it.filter((x) => x.isActive !== false))
      })
      .catch(() => setError('Error al cargar datos'))
      .finally(() => setLoadingData(false))
  }, [open])

  const issueType = issueTypes.find((it) => it.id === issueTypeId)
  const duration = issueType?.workMinutes ?? 60

  const loadSlots = async () => {
    if (!cornerId || !date) return
    setLoadingSlots(true)
    setError('')
    setSelectedSlot(null)
    try {
      const data = await availabilityApi.getSlots(cornerId, date, duration)
      setSlots(data)
      setAutoDate('')
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error al obtener disponibilidad')
    } finally {
      setLoadingSlots(false)
    }
  }

  const autoSchedule = async () => {
    if (!cornerId) return
    setLoadingAuto(true)
    setError('')
    setSelectedSlot(null)
    setSlots([])
    const today = new Date()
    for (let i = 0; i < 14; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const dateStr = d.toISOString().slice(0, 10)
      try {
        const data = await availabilityApi.getSlots(cornerId, dateStr, duration)
        const first = data.find((s) => s.available)
        if (first) {
          setSelectedSlot(first)
          setAutoDate(dateStr)
          setDate(dateStr)
          setSlots(data)
          setLoadingAuto(false)
          return
        }
      } catch {
        // Try next day
      }
    }
    setError('No hay disponibilidad en los próximos 14 días')
    setLoadingAuto(false)
  }

  const handleSubmit = async () => {
    if (!cornerId || !issueTypeId || !selectedSlot || !user || !device) return
    setLoading(true)
    setError('')
    try {
      const incident = await incidentsApi.create({
        cornerId,
        issueTypeId,
        customerId: user.monolithUserId,
        slotIds: selectedSlot.slotIds,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        origin: 'event-corner-app',
        notes: notes.trim() || undefined,
        device: { serialNumber: device.serialNumber },
      })
      setCreatedIncident(incident)
      setStep('done')
      onCreated(incident)
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error al crear la incidencia')
    } finally {
      setLoading(false)
    }
  }

  const nav = (s: CreateStep) => { setError(''); setStep(s) }

  const deviceName = device
    ? ([device.brand, device.model].filter(Boolean).join(' ') || device.deviceType || device.serialNumber)
    : ''

  const stepIndex = { setup: 0, schedule: 1, confirm: 2, done: 3 }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Incidencia</DialogTitle>
          {device && (
            <DialogDescription className="font-mono text-xs">
              {deviceName} · {device.serialNumber}
            </DialogDescription>
          )}
        </DialogHeader>

        {/* Step indicator */}
        {step !== 'done' && (
          <div className="flex items-center gap-1 text-xs">
            {(['setup', 'schedule', 'confirm'] as CreateStep[]).map((s, i) => {
              const labels: Record<string, string> = { setup: 'Configurar', schedule: 'Horario', confirm: 'Confirmar' }
              const past = stepIndex[step] > stepIndex[s]
              const active = step === s
              return (
                <span key={s} className="flex items-center gap-1 shrink-0">
                  {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
                  <span className={cn(
                    active ? 'text-foreground font-semibold' : past ? 'text-muted-foreground line-through' : 'text-muted-foreground',
                  )}>
                    {labels[s]}
                  </span>
                </span>
              )
            })}
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">{error}</AlertDescription>
          </Alert>
        )}

        {/* ── Step: Setup (corner + issue type) ─────────────────────────── */}
        {step === 'setup' && (
          <div className="space-y-4">
            {loadingData ? (
              <>
                <div className="h-10 bg-muted animate-pulse rounded" />
                <div className="h-10 bg-muted animate-pulse rounded" />
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Corner de atención</Label>
                  <Select value={cornerId} onValueChange={setCornerId}>
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

                <div className="space-y-2">
                  <Label>Tipo de incidencia</Label>
                  <Select value={issueTypeId} onValueChange={setIssueTypeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {issueTypes.map((it) => (
                        <SelectItem key={it.id} value={it.id}>
                          {it.name}{it.workMinutes ? ` · ${it.workMinutes} min` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {issueType?.description && (
                    <p className="text-xs text-muted-foreground">{issueType.description}</p>
                  )}
                </div>
              </>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button
                disabled={!cornerId || !issueTypeId || loadingData}
                onClick={() => nav('schedule')}
              >
                Siguiente <ArrowRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step: Schedule ─────────────────────────────────────────────── */}
        {step === 'schedule' && (
          <div className="space-y-4">
            {/* Manual date + load slots */}
            <div className="flex gap-2 items-end">
              <div className="flex-1 space-y-2">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={date}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => { setDate(e.target.value); setSelectedSlot(null); setSlots([]); setAutoDate('') }}
                />
              </div>
              <Button
                variant="outline"
                onClick={loadSlots}
                disabled={loadingSlots}
                className="gap-1.5 shrink-0"
              >
                <Calendar className="h-4 w-4" />
                {loadingSlots ? 'Cargando...' : 'Ver turnos'}
              </Button>
            </div>

            {/* Auto-schedule */}
            <Button
              variant="outline"
              className="w-full gap-2 border-dashed"
              onClick={autoSchedule}
              disabled={loadingAuto}
            >
              <Zap className="h-4 w-4 text-amber-500" />
              {loadingAuto ? 'Buscando próximo turno disponible...' : 'Asignar próximo turno disponible automáticamente'}
            </Button>

            {/* Slot list */}
            {slots.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Turnos disponibles{autoDate ? ` — ${autoDate}` : ''}
                </p>
                <div className="max-h-52 overflow-y-auto space-y-1.5 pr-0.5">
                  {slots.filter((s) => s.available).length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Sin disponibilidad para esta fecha</p>
                  ) : (
                    slots.filter((s) => s.available).map((slot, i) => (
                      <div
                        key={i}
                        onClick={() => setSelectedSlot(slot)}
                        className={cn(
                          'flex items-center justify-between p-2.5 border rounded-lg cursor-pointer transition-colors',
                          selectedSlot?.startTime === slot.startTime
                            ? 'border-primary bg-primary/5'
                            : 'hover:bg-muted/50',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{formatDate(slot.startTime)}</p>
                            <p className="text-xs text-muted-foreground">hasta {formatDate(slot.endTime)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {slot.technicians && (
                            <Badge variant="secondary" className="text-xs">{slot.technicians.available} téc.</Badge>
                          )}
                          {selectedSlot?.startTime === slot.startTime && (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Selected slot highlight */}
            {selectedSlot && (
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                <div>
                  <p className="font-medium text-primary">Turno seleccionado</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(selectedSlot.startTime)} → {formatDate(selectedSlot.endTime)}
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => nav('setup')}>
                <ArrowLeft className="h-4 w-4" /> Atrás
              </Button>
              <Button
                disabled={!selectedSlot}
                onClick={() => nav('confirm')}
              >
                Siguiente <ArrowRight className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step: Confirm ──────────────────────────────────────────────── */}
        {step === 'confirm' && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Dispositivo:</span>
                <span className="font-mono text-xs">{device?.serialNumber}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Corner:</span>
                <span className="font-medium">{corners.find((c) => c.id === cornerId)?.name}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-muted-foreground">Tipo:</span>
                <span className="font-medium">{issueType?.name}</span>
              </div>
              {selectedSlot && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Turno:</span>
                  <span>{formatDate(selectedSlot.startTime)} → {formatDate(selectedSlot.endTime)}</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Descripción del problema <span className="text-muted-foreground font-normal">(opcional)</span></Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalla el problema o información relevante para el técnico..."
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => nav('schedule')}>
                <ArrowLeft className="h-4 w-4" /> Atrás
              </Button>
              <Button onClick={handleSubmit} disabled={loading}>
                {loading ? 'Creando...' : 'Crear incidencia'}
                <CheckCircle2 className="h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* ── Step: Done ─────────────────────────────────────────────────── */}
        {step === 'done' && createdIncident && (
          <div className="space-y-4 text-center py-2">
            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
            <div>
              <p className="font-semibold text-base">¡Incidencia creada!</p>
              <p className="text-sm text-muted-foreground mt-1">
                Tu solicitud fue registrada.
                {createdIncident.snowqCorrelationId && ' El número ServiceNow se asignará en breve.'}
              </p>
            </div>
            {createdIncident.servicenowNumber && (
              <Badge variant="outline" className="font-mono mx-auto">{createdIncident.servicenowNumber}</Badge>
            )}
            <DialogFooter className="sm:justify-center">
              <Button onClick={onClose}>Cerrar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ── Incident Actions Modal ─────────────────────────────────────────────────

interface IncidentActionsModalProps {
  incident: Incident | null
  open: boolean
  onClose: () => void
  onUpdated: (incident: Incident) => void
}

function IncidentActionsModal({ incident, open, onClose, onUpdated }: IncidentActionsModalProps) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [reason, setReason] = useState('')
  const [action, setAction] = useState<'cancel' | 'validate' | 'reopen' | null>(null)

  useEffect(() => {
    if (open) { setError(''); setReason(''); setAction(null) }
  }, [open, incident?.id])

  if (!incident) return null

  const canCancel = incident.status === 'CREATED'
  const canValidate = incident.status === 'CLOSED'
  const canReopen = ['CLOSED', 'VALIDATED'].includes(incident.status)
  const hasActions = canCancel || canValidate || canReopen

  const handleAction = async () => {
    if (!action || !user) return
    setLoading(true)
    setError('')
    try {
      let updated: Incident
      if (action === 'cancel') {
        updated = await incidentsApi.cancel(incident.id, user.monolithUserId, reason.trim() || undefined)
      } else if (action === 'validate') {
        updated = await incidentsApi.validate(incident.id, user.monolithUserId)
      } else {
        updated = await incidentsApi.reopen(incident.id, user.monolithUserId, { reason: reason.trim() || undefined })
      }
      onUpdated(updated)
    } catch (err: unknown) {
      setError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'No se pudo completar la acción')
    } finally {
      setLoading(false)
    }
  }

  const deviceLabel = incident.device
    ? ([incident.device.brand, incident.device.model].filter(Boolean).join(' ') || incident.device.serialNumber)
    : incident.deviceId?.slice(0, 8)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{incident.issueType?.name ?? 'Incidencia'}</DialogTitle>
          {deviceLabel && (
            <DialogDescription className="font-mono text-xs">{deviceLabel}</DialogDescription>
          )}
        </DialogHeader>

        {/* Summary */}
        <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
          <div className="flex justify-between items-center gap-2">
            <span className="text-muted-foreground">Estado:</span>
            <IncidentStatusBadge status={incident.status} />
          </div>
          {incident.corner?.name && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Corner:</span>
              <span>{incident.corner.name}</span>
            </div>
          )}
          {incident.scheduledRange && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Fecha:</span>
              <span>{formatDate(incident.scheduledRange.start)}</span>
            </div>
          )}
          {incident.technician?.name && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">Técnico:</span>
              <span>{incident.technician.name}</span>
            </div>
          )}
          {incident.servicenowNumber && (
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">SN:</span>
              <code className="font-mono text-xs">{incident.servicenowNumber}</code>
            </div>
          )}
        </div>

        {/* Action buttons (when none selected) */}
        {!action && hasActions && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Acciones</p>
            {canCancel && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2 text-destructive border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                onClick={() => setAction('cancel')}
              >
                <XCircle className="h-4 w-4" />
                Cancelar incidencia
              </Button>
            )}
            {canValidate && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2 text-green-700 dark:text-green-400 border-green-600/30 hover:bg-green-50 dark:hover:bg-green-950"
                onClick={() => setAction('validate')}
              >
                <ThumbsUp className="h-4 w-4" />
                El problema fue resuelto — confirmar
              </Button>
            )}
            {canReopen && (
              <Button
                variant="outline"
                className="w-full justify-start gap-2"
                onClick={() => setAction('reopen')}
              >
                <RotateCcw className="h-4 w-4" />
                Reabrir incidencia
              </Button>
            )}
          </div>
        )}

        {/* Action confirmation panel */}
        {action && (
          <div className="space-y-3 border rounded-lg p-3">
            <p className="text-sm font-medium">
              {action === 'cancel' && 'Cancelar incidencia'}
              {action === 'validate' && 'Confirmar resolución'}
              {action === 'reopen' && 'Reabrir incidencia'}
            </p>

            {action === 'validate' && (
              <p className="text-sm text-muted-foreground">
                Confirmás que el técnico resolvió el problema. La incidencia quedará como <strong>Validada</strong>.
              </p>
            )}

            {(action === 'cancel' || action === 'reopen') && (
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">
                  {action === 'cancel' ? 'Motivo (opcional)' : 'Motivo de reapertura (opcional)'}
                </Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={
                    action === 'cancel'
                      ? 'Describe el motivo de cancelación...'
                      : 'Describe qué sigue sin funcionar...'
                  }
                  rows={2}
                />
              </div>
            )}

            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-sm">{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setAction(null); setError('') }}
                disabled={loading}
              >
                Volver
              </Button>
              <Button
                size="sm"
                variant={action === 'cancel' ? 'destructive' : 'default'}
                onClick={handleAction}
                disabled={loading}
              >
                {loading ? 'Procesando...' : 'Confirmar'}
              </Button>
            </div>
          </div>
        )}

        {!hasActions && (
          <p className="text-sm text-muted-foreground text-center py-2">
            No hay acciones disponibles para el estado actual.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Technician Incident Modal ──────────────────────────────────────────────
// Transiciones válidas que puede ejecutar un técnico

const TECHNICIAN_TRANSITIONS: Partial<Record<IncidentStatus, IncidentStatus[]>> = {
  CREATED:                    ['DELIVERED'],
  DELIVERED:                  ['IN_PROGRESS', 'PENDING_THIRD_PARTY', 'PENDING_USER', 'PENDING_SPARE_PART'],
  IN_PROGRESS:                ['PENDING_THIRD_PARTY', 'PENDING_USER', 'PENDING_SPARE_PART', 'PENDING_PICKUP', 'PENDING_REPLACEMENT_DELIVERY'],
  PENDING_THIRD_PARTY:        ['IN_PROGRESS'],
  PENDING_USER:               ['IN_PROGRESS'],
  PENDING_SPARE_PART:         ['IN_PROGRESS'],
  PENDING_PICKUP:             ['CLOSED'],
  PENDING_REPLACEMENT_DELIVERY: ['CLOSED'],
  REOPENED:                   ['IN_PROGRESS'],
}

const STATUS_LABELS: Record<string, string> = {
  CREATED: 'Creada', DELIVERED: 'Entregada', IN_PROGRESS: 'En progreso',
  PENDING_THIRD_PARTY: 'Pend. tercero', PENDING_USER: 'Pend. usuario',
  PENDING_SPARE_PART: 'Pend. repuesto', PENDING_PICKUP: 'Pend. recogida',
  PENDING_REPLACEMENT_DELIVERY: 'Pend. sustitución', CLOSED: 'Cerrada',
  REOPENED: 'Reabierta', VALIDATED: 'Validada', CANCELED: 'Cancelada', NOTE_ADDED: 'Nota añadida',
  ASSIGNED: 'Asignada', ACCEPTED: 'Aceptada', TECHNICIAN_CHANGED: 'Técnico cambiado',
  STATUS_CHANGED: 'Estado cambiado',
}

const TIMELINE_ICON: Record<string, React.ElementType> = {
  NOTE_ADDED: MessageSquare,
  ASSIGNED: LogIn,
  ACCEPTED: CheckCircle2,
  TECHNICIAN_CHANGED: RefreshCw,
}

interface TechnicianIncidentModalProps {
  incident: Incident | null
  open: boolean
  onClose: () => void
  onUpdated: (incident: Incident) => void
  onReleased: () => void
}

function TechnicianIncidentModal({ incident, open, onClose, onUpdated, onReleased }: TechnicianIncidentModalProps) {
  const { user } = useAuth()
  const [timeline, setTimeline] = useState<IncidentTimelineEntry[]>([])
  const [loadingTimeline, setLoadingTimeline] = useState(false)

  // Status change
  const [newStatus, setNewStatus] = useState('')
  const [statusComment, setStatusComment] = useState('')
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [statusError, setStatusError] = useState('')

  // Note
  const [noteText, setNoteText] = useState('')
  const [loadingNote, setLoadingNote] = useState(false)
  const [noteError, setNoteError] = useState('')

  useEffect(() => {
    if (!open || !incident) return
    setNewStatus('')
    setStatusComment('')
    setStatusError('')
    setNoteText('')
    setNoteError('')
    setLoadingTimeline(true)
    incidentsApi.getTimeline(incident.id)
      .then(setTimeline)
      .catch(() => setTimeline([]))
      .finally(() => setLoadingTimeline(false))
  }, [open, incident?.id])

  if (!incident) return null

  const availableTransitions = TECHNICIAN_TRANSITIONS[incident.status] ?? []
  const technicianId = user?.technicianId ?? undefined

  const refreshTimeline = async () => {
    const tl = await incidentsApi.getTimeline(incident.id).catch(() => timeline)
    setTimeline(tl)
  }

  const handleChangeStatus = async () => {
    if (!newStatus || !technicianId) return
    setLoadingStatus(true)
    setStatusError('')
    try {
      await incidentsApi.changeStatus(incident.id, {
        technicianId,
        newStatus: newStatus as IncidentStatus,
        comment: statusComment.trim() || undefined,
      })
      // Recargar la incidencia completa con relaciones desde el servidor
      const fresh = await incidentsApi.getById(incident.id)
      await refreshTimeline()
      setNewStatus('')
      setStatusComment('')
      onUpdated(fresh)
    } catch (err: unknown) {
      setStatusError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error al cambiar estado')
    } finally {
      setLoadingStatus(false)
    }
  }

  const handleRelease = async () => {
    if (!technicianId) return
    setLoadingStatus(true)
    setStatusError('')
    try {
      await incidentsApi.release(incident.id, technicianId)
      onClose()
      onReleased()
    } catch (err: unknown) {
      setStatusError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error al liberar la incidencia')
    } finally {
      setLoadingStatus(false)
    }
  }

  const handleAddNote = async () => {
    if (!noteText.trim()) return
    setLoadingNote(true)
    setNoteError('')
    try {
      await incidentsApi.addNote(incident.id, { technicianId, comment: noteText.trim() })
      await refreshTimeline()
      setNoteText('')
    } catch (err: unknown) {
      setNoteError((err as { response?: { data?: { message?: string } } })?.response?.data?.message || 'Error al agregar nota')
    } finally {
      setLoadingNote(false)
    }
  }

  const deviceLabel = incident.device
    ? ([incident.device.brand, incident.device.model].filter(Boolean).join(' ') || incident.device.serialNumber)
    : incident.deviceId?.slice(0, 8)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* ── Header ── */}
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            {incident.issueType?.name ?? 'Incidencia'}
            <IncidentStatusBadge status={incident.status} />
          </DialogTitle>
          {deviceLabel && (
            <DialogDescription className="font-mono text-xs">{deviceLabel}</DialogDescription>
          )}
        </DialogHeader>

        {/* ── Two-column body ── */}
        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 gap-4 min-h-0">

          {/* ── LEFT: info + acciones ── */}
          <div className="overflow-y-auto space-y-4 pr-1">

            {/* Información */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Información</p>
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-sm">
                {incident.corner?.name && (
                  <InfoLine label="Corner" value={incident.corner.name} />
                )}
                {incident.customer?.email && (
                  <InfoLine label="Email cliente" value={incident.customer.email} />
                )}
                {incident.device && (
                  <InfoLine
                    label="Dispositivo"
                    value={<code className="font-mono text-xs">{incident.device.serialNumber}</code>}
                  />
                )}
                {incident.scheduledRange && (
                  <InfoLine
                    label="Turno"
                    value={`${formatDate(incident.scheduledRange.start)} → ${formatDate(incident.scheduledRange.end)}`}
                  />
                )}
                {incident.notes && (
                  <InfoLine label="Notas" value={incident.notes} />
                )}
                {incident.servicenowNumber && (
                  <InfoLine label="SN" value={<code className="font-mono text-xs">{incident.servicenowNumber}</code>} />
                )}
                <InfoLine label="Creada" value={<span className="text-xs">{formatDate(incident.createdAt)}</span>} />
              </div>
            </div>

            {/* Cambiar estado */}
            {availableTransitions.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cambiar estado</p>
                <Select value={newStatus} onValueChange={setNewStatus}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar nuevo estado..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTransitions.map((s) => (
                      <SelectItem key={s} value={s}>{STATUS_LABELS[s] ?? s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newStatus && (
                  <Textarea
                    value={statusComment}
                    onChange={(e) => setStatusComment(e.target.value)}
                    placeholder="Comentario del cambio (opcional)..."
                    rows={2}
                    maxLength={500}
                  />
                )}
                {statusError && (
                  <Alert variant="destructive" className="py-2">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription className="text-sm">{statusError}</AlertDescription>
                  </Alert>
                )}
                {newStatus && (
                  <Button className="w-full" disabled={loadingStatus} onClick={handleChangeStatus}>
                    {loadingStatus ? 'Actualizando...' : `Pasar a "${STATUS_LABELS[newStatus] ?? newStatus}"`}
                  </Button>
                )}
              </div>
            )}

            {/* Agregar nota */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agregar nota de avance</p>
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Escribe una nota sobre el avance de la incidencia..."
                rows={3}
                maxLength={500}
              />
              {noteError && (
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">{noteError}</AlertDescription>
                </Alert>
              )}
              <Button
                variant="outline"
                className="w-full gap-2"
                disabled={!noteText.trim() || loadingNote}
                onClick={handleAddNote}
              >
                <Send className="h-4 w-4" />
                {loadingNote ? 'Guardando...' : 'Guardar nota'}
              </Button>
            </div>
          </div>

          {/* ── RIGHT: historial ── */}
          <div className="flex flex-col min-h-0 border-l pl-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2 shrink-0">
              <History className="h-3.5 w-3.5" />
              Historial {timeline.length > 0 && `(${timeline.length})`}
            </p>
            {loadingTimeline ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
              </div>
            ) : timeline.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sin historial disponible</p>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-1 pr-1">
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
                          <span className="font-medium text-xs">{label}</span>
                          <span className="text-xs text-muted-foreground shrink-0">{formatDate(entry.createdAt)}</span>
                        </div>
                        {entry.fromStatus && entry.toStatus && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                            <span>{STATUS_LABELS[entry.fromStatus] ?? entry.fromStatus}</span>
                            <ArrowRight className="h-3 w-3" />
                            <span>{STATUS_LABELS[entry.toStatus] ?? entry.toStatus}</span>
                          </div>
                        )}
                        {entry.comment && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">"{entry.comment}"</p>
                        )}
                        {entry.technicianName && (
                          <p className="text-xs text-muted-foreground mt-0.5">Tec: {entry.technicianName}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="shrink-0 flex items-center justify-between pt-3 border-t mt-2 gap-2">
          <Button
            variant="destructive"
            onClick={handleRelease}
            disabled={loadingStatus}
          >
            <XCircle className="h-4 w-4 mr-1.5" />
            Liberar incidencia
          </Button>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function InfoLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-muted-foreground min-w-28 shrink-0">{label}:</span>
      <span className="flex-1 break-words text-right">{value}</span>
    </div>
  )
}

// ── Admin/Tech dashboard helpers ──────────────────────────────────────────

interface StatCard {
  label: string
  value: number | string
  icon: React.ElementType
  description?: string
  loading: boolean
}

function StatCardItem({ label, value, icon: Icon, description, loading }: StatCard) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-8 w-16 bg-muted animate-pulse rounded" />
        ) : (
          <div className="text-2xl font-bold">{value}</div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  )
}

// ── Employee dashboard ─────────────────────────────────────────────────────

function DeviceStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    SYNCED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
    STALE: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
    NOT_FOUND: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
    SYNC_ERROR: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
    VIRTUAL: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', map[status] ?? '')}>
      {status}
    </span>
  )
}

function EmployeeDashboard() {
  const { user } = useAuth()

  const [devices, setDevices] = useState<DeviceSummary[]>([])
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loadingDevices, setLoadingDevices] = useState(true)
  const [loadingIncidents, setLoadingIncidents] = useState(true)
  const [error, setError] = useState('')

  // Modal state
  const [createDevice, setCreateDevice] = useState<DeviceSummary | null>(null)
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)

  const loadAll = async () => {
    if (!user) return
    setError('')
    setLoadingDevices(true)
    setLoadingIncidents(true)

    const [incResult] = await Promise.allSettled([
      incidentsApi.mine(),
      devicesApi.syncForUser(user.monolithUserId).catch(() => null),
    ])

    if (incResult.status === 'fulfilled') {
      setIncidents(incResult.value.data)
    } else {
      setError('No se pudieron cargar las incidencias')
    }
    setLoadingIncidents(false)

    try {
      const devData = await devicesApi.listByUser(user.monolithUserId)
      setDevices(devData)
    } catch {
      // no devices is OK
    }
    setLoadingDevices(false)
  }

  useEffect(() => { loadAll() }, [user?.monolithUserId])

  const deviceIdsWithActiveIncident = new Set(
    incidents
      .filter((i) => ACTIVE_STATUSES.has(i.status) && i.deviceId)
      .map((i) => i.deviceId as string),
  )

  const activeIncidents = incidents
    .filter((i) => ACTIVE_STATUSES.has(i.status))
    .sort((a, b) => {
      const ta = a.scheduledRange?.start ?? a.createdAt
      const tb = b.scheduledRange?.start ?? b.createdAt
      return new Date(ta).getTime() - new Date(tb).getTime()
    })

  const closedIncidents = incidents
    .filter((i) => !ACTIVE_STATUSES.has(i.status))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 5)

  const handleIncidentCreated = (incident: Incident) => {
    setIncidents((prev) => [incident, ...prev])
  }

  const handleIncidentUpdated = (updated: Incident) => {
    setIncidents((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
    setSelectedIncident(null)
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!user?.companyId && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Tu cuenta no tiene empresa asignada. Contacta al administrador para poder crear incidencias.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ── Mis Dispositivos ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Mis Dispositivos
                </CardTitle>
                <CardDescription>Seleccioná un dispositivo para crear una incidencia</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={loadingDevices}
                onClick={loadAll}
                className="h-7 gap-1.5 text-xs text-muted-foreground"
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loadingDevices && 'animate-spin')} />
                Sync
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadingDevices ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : devices.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Monitor className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No tenés dispositivos registrados</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Contactá al administrador si deberías tener dispositivos
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {devices.map((device) => {
                  const hasActiveIncident = deviceIdsWithActiveIncident.has(device.id)
                  const canCreate = !!user?.companyId && !hasActiveIncident
                  const deviceName = [device.brand, device.model].filter(Boolean).join(' ') || device.deviceType || 'Dispositivo'

                  return (
                    <div
                      key={device.id}
                      className="flex items-center gap-3 p-3 border rounded-lg"
                    >
                      <Monitor className="h-8 w-8 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{deviceName}</p>
                        <p className="text-xs font-mono text-muted-foreground">{device.serialNumber}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <DeviceStatusBadge status={device.status} />
                          {hasActiveIncident && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">
                              Incidencia activa
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant={canCreate ? 'default' : 'outline'}
                        disabled={!canCreate}
                        onClick={() => setCreateDevice(device)}
                        title={
                          hasActiveIncident
                            ? 'Ya tiene una incidencia activa'
                            : !user?.companyId
                            ? 'Necesitás empresa asignada'
                            : undefined
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {hasActiveIncident ? 'En atención' : 'Incidencia'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Mis Incidencias ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Mis Incidencias
            </CardTitle>
            <CardDescription>
              {loadingIncidents
                ? '...'
                : `${activeIncidents.length} activa(s) · ${incidents.length} total — clic para gestionar`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingIncidents ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-14 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : incidents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <ClipboardList className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No tenés incidencias registradas</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeIncidents.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      Activas
                    </p>
                    {activeIncidents.map((inc) => (
                      <IncidentRow
                        key={inc.id}
                        incident={inc}
                        onClick={() => setSelectedIncident(inc)}
                      />
                    ))}
                  </>
                )}

                {closedIncidents.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-3 mb-1">
                      Recientes cerradas
                    </p>
                    {closedIncidents.map((inc) => (
                      <IncidentRow
                        key={inc.id}
                        incident={inc}
                        onClick={() => setSelectedIncident(inc)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modals */}
      <CreateIncidentModal
        device={createDevice}
        open={!!createDevice}
        onClose={() => setCreateDevice(null)}
        onCreated={handleIncidentCreated}
      />

      <IncidentActionsModal
        incident={selectedIncident}
        open={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
        onUpdated={handleIncidentUpdated}
      />
    </div>
  )
}

function IncidentRow({ incident, onClick }: { incident: Incident; onClick: () => void }) {
  const deviceLabel = incident.device
    ? ([incident.device.brand, incident.device.model].filter(Boolean).join(' ') || incident.device.serialNumber)
    : incident.deviceId
    ? incident.deviceId.slice(0, 8)
    : null

  // Show hint for available customer actions
  const actionHint =
    incident.status === 'CREATED'
      ? 'Cancelable'
      : incident.status === 'CLOSED'
      ? 'Validar / Reabrir'
      : incident.status === 'VALIDATED'
      ? 'Reabrir'
      : null

  return (
    <div
      className="flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <IncidentStatusBadge status={incident.status} />
          {incident.issueType?.name && (
            <span className="text-xs text-muted-foreground truncate">{incident.issueType.name}</span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          {incident.scheduledRange ? (
            <span className="text-xs text-muted-foreground">
              {formatDate(incident.scheduledRange.start)}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">{formatDate(incident.createdAt)}</span>
          )}
          {deviceLabel && (
            <span className="text-xs font-mono text-muted-foreground truncate">· {deviceLabel}</span>
          )}
          {incident.corner?.name && (
            <span className="text-xs text-muted-foreground truncate">· {incident.corner.name}</span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        {actionHint && (
          <span className="text-xs text-primary hidden sm:inline">{actionHint}</span>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </div>
  )
}

// ── Admin / Technician dashboard ───────────────────────────────────────────

function AdminDashboard() {
  const navigate = useNavigate()
  const { user, can } = useAuth()
  const [corners, setCorners] = useState<Corner[]>([])
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([])
  const [loadingCorners, setLoadingCorners] = useState(true)
  const [loadingIssueTypes, setLoadingIssueTypes] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setError('')
    setLoadingCorners(true)
    setLoadingIssueTypes(true)
    try {
      const [c, it] = await Promise.allSettled([cornersApi.list(), issueTypesApi.list()])
      if (c.status === 'fulfilled') setCorners(c.value)
      if (it.status === 'fulfilled') setIssueTypes(it.value)
      if (c.status === 'rejected' && it.status === 'rejected') {
        setError('Error al cargar datos del dashboard. Verifica que el api-gateway esté activo.')
      }
    } finally {
      setLoadingCorners(false)
      setLoadingIssueTypes(false)
    }
  }

  useEffect(() => { load() }, [])

  const activeCorners = corners.filter((c) => c.isActive)
  const activeIssueTypes = issueTypes.filter((it) => it.isActive !== false)

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div>
        <h2 className="text-xl font-semibold">
          Bienvenido{user?.name ? `, ${user.name}` : ''}
        </h2>
        <p className="text-muted-foreground text-sm">Resumen de la plataforma Event Corner</p>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        {can('corner:list') && (
          <StatCardItem label="Corners activos" value={activeCorners.length} icon={MapPin} description={`${corners.length} totales`} loading={loadingCorners} />
        )}
        {can('issue-type:list') && (
          <StatCardItem label="Tipos de incidencia" value={activeIssueTypes.length} icon={Tag} description="configurados activos" loading={loadingIssueTypes} />
        )}
        {can('incident:list') && (
          <StatCardItem label="Incidencias" value="—" icon={AlertCircle} description="Filtra por corner para ver" loading={false} />
        )}
        {can('request:list') && (
          <StatCardItem label="Requests" value="—" icon={ClipboardList} description="Filtrar por cliente" loading={false} />
        )}
      </div>

      <div>
        <h3 className="text-base font-semibold mb-3">Acciones rápidas</h3>
        <div className="flex flex-wrap gap-3">
          {can('incident:create') && (
            <Button onClick={() => navigate('/incidents/new')}>
              <Plus className="h-4 w-4" />
              Nueva Incidencia
            </Button>
          )}
          {can('request:create') && (
            <Button variant="outline" onClick={() => navigate('/requests/new')}>
              <Plus className="h-4 w-4" />
              Nuevo Request
            </Button>
          )}
          {can('corner:manage-schedules') && (
            <Button variant="outline" onClick={() => navigate('/corners')}>
              <MapPin className="h-4 w-4" />
              Ver Corners
            </Button>
          )}
          {can('availability:read') && (
            <Button variant="outline" onClick={() => navigate('/availability')}>
              <ClipboardList className="h-4 w-4" />
              Verificar Disponibilidad
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Corners recientes</CardTitle>
            <CardDescription>Puntos de servicio configurados</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingCorners ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
            ) : corners.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay corners configurados</p>
            ) : (
              <div className="space-y-2">
                {corners.slice(0, 5).map((corner) => (
                  <div key={corner.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 -mx-2 px-2 rounded" onClick={() => navigate('/corners')}>
                    <div>
                      <p className="text-sm font-medium">{corner.name}</p>
                      <p className="text-xs text-muted-foreground">{corner.clientName}</p>
                    </div>
                    <Badge variant={corner.isActive ? 'default' : 'secondary'}>{corner.isActive ? 'Activo' : 'Inactivo'}</Badge>
                  </div>
                ))}
                {corners.length > 5 && (
                  <Button variant="ghost" size="sm" onClick={() => navigate('/corners')} className="w-full mt-1">Ver todos ({corners.length})</Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tipos de incidencia</CardTitle>
            <CardDescription>Catálogo configurado</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingIssueTypes ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}</div>
            ) : issueTypes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay tipos configurados</p>
            ) : (
              <div className="space-y-2">
                {issueTypes.slice(0, 5).map((it) => (
                  <div key={it.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 -mx-2 px-2 rounded" onClick={() => navigate('/issue-types')}>
                    <div>
                      <p className="text-sm font-medium">{it.name}</p>
                      {it.servicenowCategory && <p className="text-xs text-muted-foreground">{it.servicenowCategory}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      {it.workMinutes && <span className="text-xs text-muted-foreground">{it.workMinutes} min</span>}
                      <Badge variant={it.isActive !== false ? 'default' : 'secondary'} className="text-xs">{it.isActive !== false ? 'Activo' : 'Inactivo'}</Badge>
                    </div>
                  </div>
                ))}
                {issueTypes.length > 5 && (
                  <Button variant="ghost" size="sm" onClick={() => navigate('/issue-types')} className="w-full mt-1">Ver todos ({issueTypes.length})</Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ── Technician dashboard ───────────────────────────────────────────────────

const ACTIVE_REQUEST_STATUSES = new Set(['CREATED', 'IN_PROGRESS'])

function TechnicianDashboard() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null)

  const load = async () => {
    if (!user?.technicianId) return
    setLoading(true)
    setError('')
    try {
      const [inc, req] = await Promise.allSettled([
        incidentsApi.byTechnician(user.technicianId),
        requestsApi.list({ technicianId: user.technicianId }),
      ])
      if (inc.status === 'fulfilled') setIncidents(inc.value)
      if (req.status === 'fulfilled') setRequests(req.value)
      if (inc.status === 'rejected' && req.status === 'rejected')
        setError('Error al cargar datos. Verifica que el api-gateway esté activo.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const activeIncidents = incidents.filter((i) => ACTIVE_STATUSES.has(i.status))
  const inProgress = incidents.filter((i) => i.status === 'IN_PROGRESS')
  const activeRequests = requests.filter((r) => ACTIVE_REQUEST_STATUSES.has(r.status))

  // Next incident: active with scheduledRange, sorted ascending
  const next = activeIncidents
    .filter((i) => i.scheduledRange)
    .sort((a, b) => new Date(a.scheduledRange!.start).getTime() - new Date(b.scheduledRange!.start).getTime())[0]

  // Work queue: active incidents sorted by scheduledRange (nulls last)
  const incidentQueue = [...activeIncidents].sort((a, b) => {
    if (!a.scheduledRange && !b.scheduledRange) return 0
    if (!a.scheduledRange) return 1
    if (!b.scheduledRange) return -1
    return new Date(a.scheduledRange.start).getTime() - new Date(b.scheduledRange.start).getTime()
  })

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">
            Bienvenido{user?.name ? `, ${user.name}` : ''}
          </h2>
          <p className="text-muted-foreground text-sm">Panel de técnico</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Quick actions */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Acciones rápidas</h3>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => navigate('/incidents/new')}>
            <Plus className="h-4 w-4" /> Nueva incidencia
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate('/requests/new')}>
            <Plus className="h-4 w-4" /> Nuevo request
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate('/incidents')}>
            <AlertCircle className="h-4 w-4" /> Ver incidencias
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate('/requests')}>
            <ClipboardList className="h-4 w-4" /> Ver requests
          </Button>
          <Button size="sm" variant="outline" onClick={() => navigate('/availability')}>
            <Calendar className="h-4 w-4" /> Disponibilidad
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Incidencias activas</CardTitle>
            <Inbox className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-8 w-12 bg-muted animate-pulse rounded" /> : <div className="text-2xl font-bold">{activeIncidents.length}</div>}
            <p className="text-xs text-muted-foreground mt-1">{inProgress.length} en progreso ahora</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Requests activos</CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? <div className="h-8 w-12 bg-muted animate-pulse rounded" /> : <div className="text-2xl font-bold">{activeRequests.length}</div>}
            <p className="text-xs text-muted-foreground mt-1">asignados a ti</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">Próximo turno</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            ) : next?.scheduledRange ? (
              <>
                <div className="text-sm font-semibold truncate">{next.issueType?.name ?? '—'}</div>
                <p className="text-xs text-muted-foreground mt-1">{formatDate(next.scheduledRange.start)}</p>
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-muted-foreground">—</div>
                <p className="text-xs text-muted-foreground mt-1">sin turno agendado</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Work queues side by side */}
      <div className="grid gap-6 lg:grid-cols-2">

        {/* Incidents queue */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Incidencias</CardTitle>
                {!loading && <Badge variant="secondary" className="text-xs">{incidentQueue.length}</Badge>}
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/incidents')}>
                Ver todas <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            </div>
            <CardDescription>Activas asignadas a ti</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}</div>
            ) : incidentQueue.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle2 className="h-7 w-7 mx-auto mb-2 text-green-500" />
                <p className="text-sm">Sin incidencias activas</p>
              </div>
            ) : (
              <div className="space-y-2">
                {incidentQueue.slice(0, 6).map((inc) => (
                  <div
                    key={inc.id}
                    className="flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => setSelectedIncident(inc)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <IncidentStatusBadge status={inc.status} />
                        <span className="text-xs font-medium truncate">{inc.issueType?.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {inc.corner?.name && <span className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" />{inc.corner.name}</span>}
                        <span className="flex items-center gap-1 shrink-0">
                          <Clock className="h-3 w-3" />
                          {inc.scheduledRange ? formatDate(inc.scheduledRange.start) : formatDate(inc.createdAt)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                ))}
                {incidentQueue.length > 6 && (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => navigate('/incidents')}>
                    Ver {incidentQueue.length - 6} más
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Requests queue */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Requests</CardTitle>
                {!loading && <Badge variant="secondary" className="text-xs">{activeRequests.length}</Badge>}
              </div>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => navigate('/requests')}>
                Ver todos <ChevronRight className="h-3 w-3 ml-0.5" />
              </Button>
            </div>
            <CardDescription>Activos asignados a ti</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-14 bg-muted animate-pulse rounded" />)}</div>
            ) : activeRequests.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <CheckCircle2 className="h-7 w-7 mx-auto mb-2 text-green-500" />
                <p className="text-sm">Sin requests activos</p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeRequests.slice(0, 6).map((req) => (
                  <div
                    key={req.id}
                    className="flex items-center gap-3 p-2.5 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => navigate('/requests')}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant={req.status === 'IN_PROGRESS' ? 'default' : 'secondary'} className="text-xs">{req.status}</Badge>
                        <span className="text-xs font-medium truncate">{req.issueType?.name}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {req.corner?.name && <span className="flex items-center gap-1 truncate"><MapPin className="h-3 w-3 shrink-0" />{req.corner.name}</span>}
                        <span className="flex items-center gap-1 shrink-0">
                          <Clock className="h-3 w-3" />
                          {req.scheduledRange ? formatDate(req.scheduledRange.start) : formatDate(req.createdAt)}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  </div>
                ))}
                {activeRequests.length > 6 && (
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => navigate('/requests')}>
                    Ver {activeRequests.length - 6} más
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

      </div>

      <TechnicianIncidentModal
        incident={selectedIncident}
        open={!!selectedIncident}
        onClose={() => setSelectedIncident(null)}
        onUpdated={(updated) => {
          setIncidents((prev) => prev.map((i) => (i.id === updated.id ? updated : i)))
          setSelectedIncident(updated)
        }}
        onReleased={() => {
          // Quitar la incidencia de la lista del técnico (ya no le pertenece)
          setIncidents((prev) => prev.filter((i) => i.id !== selectedIncident?.id))
          setSelectedIncident(null)
        }}
      />
    </div>
  )
}

// ── Root DashboardPage ─────────────────────────────────────────────────────

export function DashboardPage() {
  const { user, can } = useAuth()

  // Permisos explícitos de dashboard (post-seed) con fallback por permisos de negocio
  const isAdmin = can('dashboard-admin:read')
    || can('corner:manage-schedules') || can('company:list') || can('user:list')
  const isTechnician = !isAdmin && (
    can('dashboard-technician:read')
    || (!!(user?.technicianId) && (can('incident:take') || can('incident:release')))
  )
  const isEmployee = !isAdmin && !isTechnician


  const title = isEmployee
    ? `Bienvenido${user?.name ? `, ${user.name}` : ''}`
    : isTechnician
    ? 'Panel Técnico'
    : 'Dashboard Event Corner'

  return (
    <div className="flex flex-col h-full">
      <Header title={title} />
      {isAdmin ? <AdminDashboard /> : isTechnician ? <TechnicianDashboard /> : <EmployeeDashboard />}
    </div>
  )
}
