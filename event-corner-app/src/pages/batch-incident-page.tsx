import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Trash2, Pencil, Send, CheckCircle2, AlertCircle,
  Clock, Search, Monitor, User, RefreshCw, ArrowLeft, ArrowRight,
  Calendar, Loader2, PackagePlus, History, X,
} from 'lucide-react'
import { useBatchDraft, UIBatchItem } from '@/hooks/use-batch-draft'
import { useUserSearch } from '@/hooks/use-user-search'
import { useCompanyTree } from '@/hooks/use-company-tree'
import { useAuth } from '@/context/auth'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  cornersApi, issueTypesApi, availabilityApi, usersApi, devicesApi,
  Corner, IssueType, AvailabilitySlot, MonolithUser, DeviceSummary,
} from '@/lib/api'
import { formatDate, cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6

const STEPS = [
  { n: 1 as const, label: 'Corner' },
  { n: 2 as const, label: 'Cliente' },
  { n: 3 as const, label: 'Dispositivo' },
  { n: 4 as const, label: 'Tipo' },
  { n: 5 as const, label: 'Horario' },
  { n: 6 as const, label: 'Confirmar' },
]

interface WizardValues {
  cornerId: string
  cornerName: string
  customerId: string
  customerName: string
  customerEmail: string
  deviceSerial: string
  issueTypeId: string
  issueTypeName: string
  slotIds: string[]
  startTime: string
  endTime: string
  description: string
  notes: string
}

// ─── Wizard Dialog ────────────────────────────────────────────────────────────

interface TakenSlot {
  cornerId: string
  startTime: string
}

interface WizardDialogProps {
  open: boolean
  onClose: () => void
  onSave: (values: WizardValues) => Promise<void>
  corners: Corner[]
  issueTypes: IssueType[]
  initial?: WizardValues
  takenSlots?: TakenSlot[]
  currentUserId?: string
}

function IncidentWizardDialog({
  open, onClose, onSave,
  corners, issueTypes,
  initial, takenSlots = [], currentUserId,
}: WizardDialogProps) {
  const [step, setStep] = useState<WizardStep>(1)
  const [selectedCornerId, setSelectedCornerId] = useState('')
  const [selectedUser, setSelectedUser] = useState<MonolithUser | null>(null)
  // En edición el usuario precargado viene del draft sin companyId (el item no
  // lo guarda), pero ya fue validado al agregarse al lote — no hay que volver
  // a exigir empresa salvo que se elija otro usuario.
  const [customerFromDraft, setCustomerFromDraft] = useState(false)
  const [selectedDevice, setSelectedDevice] = useState<DeviceSummary | null>(null)
  const [manualSerial, setManualSerial] = useState('')
  const [selectedIssueTypeId, setSelectedIssueTypeId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')
  const [devices, setDevices] = useState<DeviceSummary[]>([])
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])
  const { query: userSearch, setQuery: setUserSearch, results: filteredUsers, loading: loadingUsers, reset: resetUserSearch } = useUserSearch(usersApi.search)
  const [deviceSearch, setDeviceSearch] = useState('')
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setStep(1)
    setError('')
    setSlots([])
    setDevices([])
    resetUserSearch()
    setDeviceSearch('')
    setSaving(false)

    if (initial) {
      setSelectedCornerId(initial.cornerId)
      setSelectedIssueTypeId(initial.issueTypeId)
      setManualSerial(initial.deviceSerial)
      setSelectedDevice(null)
      setDescription(initial.description)
      setNotes(initial.notes)
      setSelectedSlot({
        startTime: initial.startTime,
        endTime: initial.endTime,
        slotIds: initial.slotIds,
        available: true,
      } as AvailabilitySlot)
      setSelectedUser({
        id: initial.customerId,
        email: initial.customerEmail,
        fullName: initial.customerName,
        name: initial.customerName,
        lastName: null,
        companyId: null,
        upn: null,
        externalId: null,
        isActive: true,
      } as MonolithUser)
      setCustomerFromDraft(true)
    } else {
      setSelectedCornerId('')
      setSelectedUser(null)
      setCustomerFromDraft(false)
      setSelectedDevice(null)
      setManualSerial('')
      setSelectedIssueTypeId('')
      setDate(new Date().toISOString().slice(0, 10))
      setSelectedSlot(null)
      setDescription('')
      setNotes('')
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const loadDevices = async (userId: string) => {
    setLoadingDevices(true)
    setDevices([])
    try {
      await devicesApi.syncForUser(userId).catch(() => {})
      const data = await devicesApi.listByUser(userId)
      setDevices(data)
    } catch {
      // user can enter serial manually
    } finally {
      setLoadingDevices(false)
    }
  }

  // El dispositivo elegido en el paso 3 filtra los tipos disponibles en el paso 4:
  // solo se muestran los tipos de ese device_type + los genéricos (deviceType null).
  // Con serial manual (o en edición, donde solo se conoce el serial) no se filtra.
  const deviceType = selectedDevice?.deviceType ?? null
  // El grupo (treeId) de la compañía del cliente filtra a su vez los tipos —
  // el backend rechaza (IssueTypeNotAllowedForCompanyError) cualquier tipo
  // que no pertenezca al mismo grupo que la compañía.
  const { treeId: companyTreeId } = useCompanyTree(selectedUser?.companyId)
  const filteredIssueTypes = issueTypes
    .filter((it) => !deviceType || !it.deviceType || it.deviceType === deviceType)
    .filter((it) => !companyTreeId || !it.treeId || it.treeId === companyTreeId)

  useEffect(() => {
    if (selectedIssueTypeId && !filteredIssueTypes.some((it) => it.id === selectedIssueTypeId)) {
      setSelectedIssueTypeId('')
      setSelectedSlot(null)
      setSlots([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceType, companyTreeId])

  // La duración de la cita la define el tipo de incidencia elegido en el paso 4
  const duration = issueTypes.find((it) => it.id === selectedIssueTypeId)?.workMinutes ?? 60

  const checkAvailability = async () => {
    if (!selectedCornerId || !date) return
    setLoadingSlots(true)
    setError('')
    try {
      const data = await availabilityApi.getSlots(selectedCornerId, date, duration, undefined, currentUserId)
      setSlots(data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al verificar disponibilidad')
    } finally {
      setLoadingSlots(false)
    }
  }

  const goToStep = (n: WizardStep) => { setError(''); setStep(n) }

  const handleSave = async () => {
    const serial = selectedDevice?.serialNumber ?? manualSerial.trim()
    if (!selectedCornerId || !selectedUser || !selectedIssueTypeId || !selectedSlot || !serial) {
      setError('Faltan campos obligatorios')
      return
    }
    if (!description.trim()) {
      setError('La descripción del problema es obligatoria')
      return
    }
    const corner = corners.find((c) => c.id === selectedCornerId)
    const issueType = issueTypes.find((it) => it.id === selectedIssueTypeId)
    const values: WizardValues = {
      cornerId: selectedCornerId,
      cornerName: corner?.name ?? selectedCornerId,
      customerId: selectedUser.id,
      customerName: selectedUser.fullName ?? selectedUser.upn ?? selectedUser.email ?? selectedUser.id,
      customerEmail: selectedUser.upn ?? selectedUser.email ?? '',
      deviceSerial: serial,
      issueTypeId: selectedIssueTypeId,
      issueTypeName: issueType?.name ?? selectedIssueTypeId,
      slotIds: selectedSlot.slotIds,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
      description: description.trim(),
      notes: notes.trim(),
    }
    setSaving(true)
    setError('')
    try {
      await onSave(values)
      onClose()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al guardar. Intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const corner = corners.find((c) => c.id === selectedCornerId)
  const issueType = issueTypes.find((it) => it.id === selectedIssueTypeId)
  const filteredDevices = devices.filter((d) => {
    if (!deviceSearch.trim()) return true
    const q = deviceSearch.toLowerCase()
    return d.serialNumber.toLowerCase().includes(q) || d.model?.toLowerCase().includes(q) || d.brand?.toLowerCase().includes(q)
  })

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v && !saving) onClose() }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Editar incidencia' : 'Agregar incidencia al lote'}</DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map(({ n, label }, i) => (
            <div key={n} className="flex items-center gap-1 shrink-0">
              <div className={cn(
                'w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold',
                step >= n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}>{n}</div>
              <span className={cn('text-xs', step >= n ? 'font-medium' : 'text-muted-foreground')}>{label}</span>
              {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* ── Step 1: Corner ─────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Corner de servicio</Label>
              <Select value={selectedCornerId} onValueChange={setSelectedCornerId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar corner..." /></SelectTrigger>
                <SelectContent>
                  {corners.filter((c) => c.isActive).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} — {c.clientName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {corner?.description && (
              <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">{corner.description}</p>
            )}
            <Button className="w-full" disabled={!selectedCornerId} onClick={() => goToStep(2)}>
              Continuar <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* ── Step 2: Customer ───────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar por nombre o upn..." value={userSearch} onChange={(e) => setUserSearch(e.target.value)} />
            </div>
            {loadingUsers ? (
              <p className="text-sm text-muted-foreground text-center py-6">Buscando...</p>
            ) : (
              <div className="space-y-0 max-h-60 overflow-y-auto border rounded-md divide-y">
                {filteredUsers.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    {userSearch.trim().length < 2 ? 'Escribí al menos 2 caracteres para buscar' : 'Sin resultados'}
                  </p>
                )}
                {filteredUsers.map((u) => (
                  <div key={u.id} onClick={() => { setSelectedUser(u); setCustomerFromDraft(false) }}
                    className={cn('flex items-center gap-3 p-3 cursor-pointer transition-colors',
                      selectedUser?.id === u.id ? 'bg-primary/10' : 'hover:bg-muted/50')}>
                    <User className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{u.fullName ?? (`${u.name ?? ''} ${u.lastName ?? ''}`.trim() || 'Sin nombre')}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.upn ?? u.email ?? '—'}</p>
                    </div>
                    {selectedUser?.id === u.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                  </div>
                ))}
              </div>
            )}
            {selectedUser && !selectedUser.companyId && !customerFromDraft && (
              <Alert variant="destructive">
                <AlertDescription>Este usuario no tiene empresa asignada.</AlertDescription>
              </Alert>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => goToStep(1)}><ArrowLeft className="h-4 w-4" /> Atrás</Button>
              <Button className="flex-1" disabled={!selectedUser || (!selectedUser.companyId && !customerFromDraft)}
                onClick={() => { goToStep(3); if (selectedUser) loadDevices(selectedUser.id) }}>
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Device ─────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Dispositivo</p>
              <Button variant="ghost" size="sm" disabled={loadingDevices}
                onClick={() => selectedUser && loadDevices(selectedUser.id)}
                className="h-7 gap-1.5 text-xs text-muted-foreground">
                <RefreshCw className={cn('h-3.5 w-3.5', loadingDevices && 'animate-spin')} /> Actualizar
              </Button>
            </div>
            {loadingDevices ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sincronizando...</p>
            ) : (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Buscar o ingresar número de serie..."
                    value={deviceSearch}
                    onChange={(e) => { setDeviceSearch(e.target.value); setSelectedDevice(null); setManualSerial('') }}
                    autoFocus />
                </div>
                <div className="border rounded-md divide-y max-h-52 overflow-y-auto">
                  {filteredDevices.length > 0 ? filteredDevices.map((d) => (
                    <div key={d.id}
                      onClick={() => { setSelectedDevice(selectedDevice?.id === d.id ? null : d); setManualSerial('') }}
                      className={cn('flex items-center gap-3 p-3 cursor-pointer transition-colors',
                        selectedDevice?.id === d.id ? 'bg-primary/10' : 'hover:bg-muted/50')}>
                      <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{[d.brand, d.model].filter(Boolean).join(' ') || d.deviceType || 'Dispositivo'}</p>
                        <p className="text-xs text-muted-foreground font-mono">{d.serialNumber}</p>
                      </div>
                      {selectedDevice?.id === d.id && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                  )) : deviceSearch.trim() ? (
                    <div onClick={() => { setManualSerial(deviceSearch.trim()); setSelectedDevice(null) }}
                      className={cn('flex items-center gap-3 p-3 cursor-pointer transition-colors',
                        manualSerial === deviceSearch.trim() ? 'bg-primary/10' : 'hover:bg-muted/50')}>
                      <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium font-mono truncate">{deviceSearch.trim()}</p>
                        <p className="text-xs text-muted-foreground">Usar como número de serie</p>
                      </div>
                      {manualSerial === deviceSearch.trim() && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground text-center py-6">Sin dispositivos. Escribí el número de serie para ingresarlo manualmente.</p>
                  )}
                </div>
              </>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => goToStep(2)}><ArrowLeft className="h-4 w-4" /> Atrás</Button>
              <Button className="flex-1" disabled={!selectedDevice && !manualSerial.trim()} onClick={() => goToStep(4)}>
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 4: Issue Type + Description ──────────── */}
        {step === 4 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de incidencia</Label>
              <Select
                value={selectedIssueTypeId}
                onValueChange={(v) => {
                  // Cambiar el tipo cambia la duración: el horario elegido deja de valer
                  if (v !== selectedIssueTypeId) { setSelectedSlot(null); setSlots([]) }
                  setSelectedIssueTypeId(v)
                }}
              >
                <SelectTrigger><SelectValue placeholder="Seleccionar tipo..." /></SelectTrigger>
                <SelectContent>
                  {filteredIssueTypes.filter((it) => it.isActive !== false).map((it) => (
                    <SelectItem key={it.id} value={it.id}>
                      {it.name}{it.workMinutes ? ` (${it.workMinutes} min)` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {deviceType && filteredIssueTypes.length < issueTypes.length && (
                <p className="text-xs text-muted-foreground">
                  Mostrando tipos para dispositivos de tipo &quot;{deviceType}&quot;
                </p>
              )}
            </div>
            {issueType && (
              <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2 space-y-0.5">
                {issueType.servicenowCategory && <p>Categoría SN: {issueType.servicenowCategory}</p>}
                {issueType.workMinutes && <p>Tiempo estimado: {issueType.workMinutes} min</p>}
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="wiz-description">
                Descripción del problema <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="wiz-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describí el problema con detalle: síntomas, cuándo ocurre, qué impacto tiene..."
                rows={4}
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => goToStep(3)}><ArrowLeft className="h-4 w-4" /> Atrás</Button>
              <Button className="flex-1" disabled={!selectedIssueTypeId || !description.trim()} onClick={() => goToStep(5)}>
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 5: Availability ───────────────────────── */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Fecha</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="space-y-2">
                <Label>Duración</Label>
                <div className="flex items-center h-10 px-3 rounded-md border bg-muted/50 text-sm">
                  {duration} min <span className="text-xs text-muted-foreground ml-1.5">(según tipo)</span>
                </div>
              </div>
            </div>
            <Button variant="outline" className="w-full" onClick={checkAvailability} disabled={loadingSlots}>
              <Calendar className="h-4 w-4" />{loadingSlots ? 'Verificando...' : 'Verificar disponibilidad'}
            </Button>
            {selectedSlot && slots.length === 0 && (
              <div className="flex items-center justify-between p-3 border rounded-lg border-primary bg-primary/5 text-sm">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-medium">{formatDate(selectedSlot.startTime)}</p>
                    <p className="text-xs text-muted-foreground">→ {formatDate(selectedSlot.endTime)} (horario previo)</p>
                  </div>
                </div>
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </div>
            )}
            {slots.length > 0 && (
              <div className="space-y-2 max-h-52 overflow-y-auto">
                <p className="text-sm font-medium">Ventanas disponibles:</p>
                {slots.filter((s) => s.available).map((slot, i) => {
                  const slotTs = new Date(slot.startTime).getTime()
                  const takenByBatch = takenSlots.some(
                    (t) => t.cornerId === selectedCornerId && new Date(t.startTime).getTime() === slotTs,
                  )
                  const isSelected = selectedSlot != null &&
                    new Date(selectedSlot.startTime).getTime() === slotTs
                  return (
                    <div key={i}
                      onClick={() => !takenByBatch && setSelectedSlot(slot)}
                      className={cn(
                        'flex items-center justify-between p-3 border rounded-lg transition-colors',
                        takenByBatch
                          ? 'opacity-50 cursor-not-allowed bg-muted/30 border-muted'
                          : isSelected
                            ? 'border-primary bg-primary/5 cursor-pointer'
                            : 'border-border hover:bg-muted/50 cursor-pointer',
                      )}>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">{formatDate(slot.startTime)}</p>
                          <p className="text-xs text-muted-foreground">→ {formatDate(slot.endTime)}</p>
                        </div>
                      </div>
                      {takenByBatch
                        ? <Badge variant="outline" className="text-muted-foreground">En uso en el lote</Badge>
                        : slot.heldByCurrentUser
                          ? <Badge variant="outline" className="border-blue-400 text-blue-600">Retenido por vos</Badge>
                          : slot.technicians
                            ? <Badge variant="secondary">{slot.technicians.available} técnico(s)</Badge>
                            : isSelected
                              ? <CheckCircle2 className="h-4 w-4 text-primary" />
                              : null
                      }
                    </div>
                  )
                })}
                {slots.filter((s) => s.available).length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Sin disponibilidad para esta fecha</p>
                )}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => goToStep(4)}><ArrowLeft className="h-4 w-4" /> Atrás</Button>
              <Button className="flex-1" onClick={() => goToStep(6)} disabled={!selectedSlot}>
                Continuar <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 6: Confirm ────────────────────────────── */}
        {step === 6 && (
          <div className="space-y-4">
            <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Corner:</span><span className="font-medium">{corner?.name ?? selectedCornerId}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cliente:</span><span className="font-medium">{selectedUser?.fullName ?? selectedUser?.upn ?? selectedUser?.email ?? '—'}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Dispositivo:</span><span className="font-mono text-xs">{selectedDevice?.serialNumber ?? manualSerial.trim()}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tipo:</span><span className="font-medium">{issueType?.name ?? selectedIssueTypeId}</span></div>
              {selectedSlot && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Horario:</span>
                  <span className="text-xs">{formatDate(selectedSlot.startTime)} — {formatDate(selectedSlot.endTime)}</span>
                </div>
              )}
              <div className="flex flex-col gap-1 pt-1 border-t">
                <span className="text-muted-foreground">Descripción:</span>
                <p className="text-xs whitespace-pre-wrap">{description}</p>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="wiz-notes">Notas adicionales (opcional)</Label>
              <Textarea id="wiz-notes" value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder="Información extra para el técnico..." rows={2} />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => goToStep(5)} disabled={saving}><ArrowLeft className="h-4 w-4" /> Atrás</Button>
              <Button className="flex-1" onClick={handleSave} disabled={saving}>
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin" />Guardando...</>
                  : <><CheckCircle2 className="h-4 w-4" />{initial ? 'Guardar cambios' : 'Agregar al lote'}</>
                }
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ item }: { item: UIBatchItem }) {
  if (item.uiStatus === 'sending') return (
    <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" />Enviando</Badge>
  )
  if (item.uiStatus === 'success') return (
    <Badge className="gap-1 bg-green-600 hover:bg-green-700"><CheckCircle2 className="h-3 w-3" />Creada</Badge>
  )
  if (item.uiStatus === 'error') return (
    <Badge variant="destructive" className="gap-1" title={item.uiError}><AlertCircle className="h-3 w-3" />Error</Badge>
  )
  if (new Date(item.startTime) <= new Date()) return (
    <Badge variant="outline" className="gap-1 border-amber-400 text-amber-600">
      <AlertCircle className="h-3 w-3" />Horario vencido
    </Badge>
  )
  return <Badge variant="outline">Pendiente</Badge>
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function BatchIncidentPage() {
  const navigate = useNavigate()
  const { user, can } = useAuth()
  const canCreateIncident = can('appointment:create')
  // Editar/quitar items del PROPIO borrador es parte de componer incidencias a
  // crear — no existe incident:update en el catálogo ABAC y gatear con él
  // dejaba la columna Acciones vacía para todos.
  const canEditDraft = canCreateIncident

  const [corners, setCorners] = useState<Corner[]>([])
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([])

  const {
    items, isLoading, addItem, editItem, removeItem, submit, discard,
    renewedUntil, hasLegacyDraft, dismissLegacy,
  } = useBatchDraft(user!.monolithUserId)

  const [editingItem, setEditingItem] = useState<UIBatchItem | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [sendDone, setSendDone] = useState(false)
  const [discarding, setDiscarding] = useState(false)

  useEffect(() => {
    Promise.all([cornersApi.list(), issueTypesApi.list({ category: 'ISSUE' })]).then(([c, it]) => {
      setCorners(c)
      setIssueTypes(it)
    })
  }, [])

  const openAdd = () => {
    if (!canCreateIncident) return
    setEditingItem(null)
    setDialogOpen(true)
  }

  const openEdit = (item: UIBatchItem) => {
    if (!canEditDraft) return
    setEditingItem(item)
    setDialogOpen(true)
  }

  const handleSave = async (values: WizardValues) => {
    if (editingItem) {
      await editItem(editingItem.id, values)
    } else {
      const localId = crypto.randomUUID()
      await addItem({ localId, ...values })
    }
    setSendDone(false)
  }

  const handleRemove = async (item: UIBatchItem) => {
    if (!canEditDraft) return
    try {
      await removeItem(item.id)
    } catch {
      // non-fatal — item may already be gone
    }
  }

  const handleSubmit = async () => {
    setIsSending(true)
    setSendDone(false)
    try {
      await submit()
    } catch {
      // errors reflected in item.uiStatus
    } finally {
      setIsSending(false)
      setSendDone(true)
    }
  }

  const handleDiscard = async () => {
    if (!confirm('¿Descartás el lote completo y liberás todos los horarios reservados?')) return
    setDiscarding(true)
    try {
      await discard()
    } finally {
      setDiscarding(false)
    }
  }

  const pendingCount = items.filter((it) => it.uiStatus === 'pending').length
  const errorCount = items.filter((it) => it.uiStatus === 'error').length
  const successCount = items.filter((it) => it.uiStatus === 'success').length
  const canSend = (pendingCount + errorCount) > 0 && !isSending

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Lote de Citas" icon={PackagePlus} />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Lote de Citas" icon={PackagePlus} />

      <div className="flex-1 p-6 overflow-auto space-y-4">

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          {canCreateIncident && (
            <Button onClick={openAdd} disabled={isSending} className="gap-2">
              <Plus className="h-4 w-4" /> Agregar incidencia
            </Button>
          )}
          <Button
            onClick={handleSubmit}
            disabled={!canSend}
            variant="default"
            className="gap-2 bg-green-600 hover:bg-green-700 text-white"
          >
            {isSending
              ? <><Loader2 className="h-4 w-4 animate-spin" />Enviando...</>
              : <><Send className="h-4 w-4" />Enviar lote {pendingCount + errorCount > 0 ? `(${pendingCount + errorCount})` : ''}</>
            }
          </Button>
          {items.length > 0 && !isSending && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive hover:text-destructive ml-auto"
              onClick={handleDiscard}
              disabled={discarding}
            >
              {discarding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
              Descartar lote
            </Button>
          )}
          {items.length > 0 && !isSending && (
            <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', items.length > 0 && 'ml-auto')}>
              {successCount > 0 && <span className="text-green-600 font-medium">{successCount} creadas</span>}
              {errorCount > 0 && <span className="text-destructive font-medium">{errorCount} con error</span>}
              {pendingCount > 0 && <span>{pendingCount} pendientes</span>}
              {renewedUntil && (
                <span className="text-xs text-muted-foreground">
                  · Horarios retenidos hasta {renewedUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Legacy draft banner */}
        {hasLegacyDraft && (
          <Alert className="border-amber-400 bg-amber-50 dark:bg-amber-950">
            <History className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-700 dark:text-amber-300 flex items-center justify-between gap-2">
              <span>Había un borrador local guardado. Los horarios no están reservados — agregá las incidencias de nuevo para reservar los slots.</span>
              <button onClick={dismissLegacy} className="text-xs underline hover:no-underline shrink-0">Cerrar</button>
            </AlertDescription>
          </Alert>
        )}

        {/* Summary after send */}
        {sendDone && errorCount === 0 && successCount > 0 && (
          <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-700 dark:text-green-300">
              Lote enviado correctamente. {successCount} incidencia{successCount !== 1 ? 's' : ''} creada{successCount !== 1 ? 's' : ''} en ServiceNow.
            </AlertDescription>
          </Alert>
        )}
        {sendDone && errorCount > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {successCount} creadas, {errorCount} fallaron. Corregí los errores y reenviá el lote.
            </AlertDescription>
          </Alert>
        )}

        {/* Empty state */}
        {items.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <PackagePlus className="h-10 w-10 text-muted-foreground opacity-40" />
              <div>
                <p className="font-medium text-muted-foreground">Sin incidencias en el lote</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {canCreateIncident
                    ? 'Hacé clic en "Agregar incidencia" para comenzar.'
                    : 'No tenés permisos para crear incidencias.'}
                </p>
              </div>
              {canCreateIncident && (
                <Button onClick={openAdd} variant="outline" className="gap-2 mt-2">
                  <Plus className="h-4 w-4" /> Agregar primera incidencia
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Batch table */}
        {items.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-muted-foreground font-medium">
                {items.length} incidencia{items.length !== 1 ? 's' : ''} en el lote
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left p-3 font-medium text-muted-foreground w-8">#</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Corner</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Cliente</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Dispositivo</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Tipo</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Horario</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Estado</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="p-3 text-muted-foreground">{idx + 1}</td>
                        <td className="p-3 font-medium max-w-[140px] truncate" title={item.cornerName}>{item.cornerName}</td>
                        <td className="p-3 max-w-[140px]">
                          <p className="truncate font-medium" title={item.customerName}>{item.customerName}</p>
                          <p className="text-xs text-muted-foreground truncate">{item.customerEmail}</p>
                        </td>
                        <td className="p-3 font-mono text-xs max-w-[120px] truncate" title={item.deviceSerial}>{item.deviceSerial}</td>
                        <td className="p-3 max-w-[120px] truncate" title={item.issueTypeName}>{item.issueTypeName}</td>
                        <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(item.startTime)}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-col gap-1">
                            <StatusBadge item={item} />
                            {item.uiStatus === 'error' && item.uiError && (
                              <p className="text-xs text-destructive max-w-[160px] line-clamp-2">{item.uiError}</p>
                            )}
                          </div>
                        </td>
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canEditDraft && (
                              <>
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-7 w-7"
                                  disabled={item.uiStatus === 'sending' || item.uiStatus === 'success'}
                                  onClick={() => openEdit(item)}
                                  title="Editar"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost" size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive"
                                  disabled={item.uiStatus === 'sending'}
                                  onClick={() => handleRemove(item)}
                                  title="Quitar"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <IncidentWizardDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        corners={corners}
        issueTypes={issueTypes}
        initial={editingItem ?? undefined}
        currentUserId={user!.abacUserId ?? undefined}
        takenSlots={items
          .filter((it) => it.uiStatus !== 'success' && it.id !== editingItem?.id)
          .map((it) => ({ cornerId: it.cornerId, startTime: it.startTime }))
        }
      />
    </div>
  )
}
