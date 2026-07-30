import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, Calendar, Clock, Search, Monitor, User, RefreshCw } from 'lucide-react'
import { useUserSearch } from '@/hooks/use-user-search'
import { useCompanyTree } from '@/hooks/use-company-tree'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  cornersApi, issueTypesApi, availabilityApi, appointmentsApi,
  usersApi, devicesApi,
  Corner, IssueType, AvailabilitySlot, Appointment, MonolithUser, DeviceSummary,
} from '@/lib/api'
import { formatDate, cn } from '@/lib/utils'
import { useAuth } from '@/context/auth'

type Step = 1 | 2 | 3 | 4 | 5 | 6

const STEPS = [
  { n: 1, label: 'Corner' },
  { n: 2, label: 'Usuario' },
  { n: 3, label: 'Dispositivo' },
  { n: 4, label: 'Tipo' },
  { n: 5, label: 'Horario' },
  { n: 6, label: 'Confirmar' },
] as const

export function CreateAppointmentPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user: authUser } = useAuth()

  // Pre-fill from dashboard device shortcut
  const presetDeviceSerial = searchParams.get('deviceSerial') ?? ''
  const presetCustomerId = searchParams.get('presetCustomerId') ?? ''

  const [step, setStep] = useState<Step>(1)

  // Data lists
  const [corners, setCorners] = useState<Corner[]>([])
  const [devices, setDevices] = useState<DeviceSummary[]>([])
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([])
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])

  // Selections
  const [selectedCornerId, setSelectedCornerId] = useState(searchParams.get('cornerId') ?? '')
  const [selectedUser, setSelectedUser] = useState<MonolithUser | null>(() => {
    // Pre-fill user from auth context when the employee clicks "Crear Cita" on a device
    if (presetCustomerId && authUser) {
      return {
        id: presetCustomerId,
        email: authUser.email,
        fullName: authUser.name ?? authUser.email,
        name: authUser.name ?? null,
        lastName: null,
        companyId: authUser.companyId,
        upn: null,
        externalId: authUser.oid ?? null,
        isActive: true,
      } as MonolithUser
    }
    return null
  })
  const [selectedDevice, setSelectedDevice] = useState<DeviceSummary | null>(null)
  const [manualSerial, setManualSerial] = useState(presetDeviceSerial && !presetCustomerId ? presetDeviceSerial : '')
  const [selectedIssueTypeId, setSelectedIssueTypeId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [description, setDescription] = useState('')
  const [notes, setNotes] = useState('')

  // UI state
  const { query: userSearch, setQuery: setUserSearch, results: filteredUsers, loading: loadingUsers } = useUserSearch(usersApi.search)
  const [deviceSearch, setDeviceSearch] = useState('')
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdAppointment, setCreatedAppointment] = useState<Appointment | null>(null)

  useEffect(() => {
    // Lista completa sin filtrar por categoría — igual que el formulario real
    // de producción, donde el empleado elige un único tipo de cita de una
    // lista plana (Incidencia/Entrega/Recolección/Onboarding/Decomisión) sin
    // distinguir "incidencia" de "solicitud" — esa clasificación la resuelve
    // el backend a partir del IssueType elegido.
    Promise.all([cornersApi.list(), issueTypesApi.list()]).then(([c, it]) => {
      setCorners(c)
      setIssueTypes(it)
    })
  }, [])

  // Auto-select device when loaded and a serial was pre-filled
  useEffect(() => {
    if (!presetDeviceSerial || devices.length === 0) return
    const found = devices.find((d) => d.serialNumber === presetDeviceSerial)
    if (found) {
      setSelectedDevice(found)
      setManualSerial('')
    } else {
      setManualSerial(presetDeviceSerial)
      setSelectedDevice(null)
    }
  }, [devices, presetDeviceSerial])

  // Load devices when entering step 3 — syncs from Minerva first, then reads local DB
  const loadDevices = async (userId: string) => {
    setLoadingDevices(true)
    setDevices([])
    try {
      // Sync from Minerva (fire-and-forget if it fails)
      await devicesApi.syncForUser(userId).catch(() => {})
      const data = await devicesApi.listByUser(userId)
      setDevices(data)
    } catch {
      // no devices is fine — user can enter serial manually
    } finally {
      setLoadingDevices(false)
    }
  }

  // El dispositivo elegido en el paso 3 filtra los tipos disponibles en el paso 4:
  // solo se muestran los tipos de ese device_type + los genéricos (deviceType null).
  // Con serial manual no se conoce el device_type, así que no se filtra.
  const deviceType = selectedDevice?.deviceType ?? null
  // El grupo (treeId) de la compañía del cliente filtra a su vez los tipos —
  // el backend rechaza (IssueTypeNotAllowedForCompanyError) cualquier tipo
  // que no pertenezca al mismo grupo que la compañía, así que no tiene
  // sentido dejarlo elegible acá.
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

  // La duración de la cita la define el tipo elegido en el paso 4
  const duration = issueTypes.find((it) => it.id === selectedIssueTypeId)?.workMinutes ?? 60

  const checkAvailability = async () => {
    if (!selectedCornerId || !date) return
    setLoadingSlots(true)
    setError('')
    try {
      const data = await availabilityApi.getSlots(selectedCornerId, date, duration)
      setSlots(data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al verificar disponibilidad')
    } finally {
      setLoadingSlots(false)
    }
  }

  const handleSubmit = async () => {
    if (!selectedCornerId || !selectedIssueTypeId || !selectedUser) {
      setError('Faltan campos obligatorios')
      return
    }
    if (!selectedSlot) {
      setError('Debes seleccionar un horario disponible')
      return
    }
    const serial = selectedDevice?.serialNumber ?? manualSerial.trim()
    if (!serial) {
      setError('El número de serie del dispositivo es obligatorio')
      return
    }
    setLoading(true)
    setError('')
    try {
      const appointment = await appointmentsApi.create({
        cornerId: selectedCornerId,
        issueTypeId: selectedIssueTypeId,
        customerId: selectedUser.id,
        slotIds: selectedSlot.slotIds,
        startTime: selectedSlot.startTime,
        endTime: selectedSlot.endTime,
        origin: 'event-corner-app',
        notes: [description.trim(), notes.trim()].filter(Boolean).join('\n\n') || undefined,
        device: { serialNumber: serial },
      })
      setCreatedAppointment(appointment)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al crear la cita')
    } finally {
      setLoading(false)
    }
  }

  const goToStep = (n: Step) => {
    setError('')
    setStep(n)
  }

  const corner = corners.find((c) => c.id === selectedCornerId)
  const issueType = issueTypes.find((it) => it.id === selectedIssueTypeId)

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

  if (createdAppointment) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Nueva Cita" />
        <div className="flex-1 p-6 flex items-center justify-center">
          <Card className="max-w-lg w-full">
            <CardHeader className="text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
              <CardTitle>Cita creada</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID:</span>
                  <code className="font-mono text-xs">{createdAppointment.id}</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estado:</span>
                  <Badge>{createdAppointment.status}</Badge>
                </div>
                {createdAppointment.snowqCorrelationId && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground shrink-0">Correlation ID:</span>
                    <code className="font-mono text-xs break-all text-right">{createdAppointment.snowqCorrelationId}</code>
                  </div>
                )}
                {createdAppointment.servicenowNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SN Number:</span>
                    <code className="font-mono text-xs">{createdAppointment.servicenowNumber}</code>
                  </div>
                )}
              </div>
              {createdAppointment.snowqCorrelationId && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    La cita fue encolada en ServiceNow. El número SN se asignará cuando se procese.
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => navigate(`/appointments/${createdAppointment.id}`)}>
                  Ver cita
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => navigate('/appointments')}>
                  Volver al listado
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <Header title="Nueva Cita" />

      <div className="flex-1 p-6 overflow-auto">
        {/* Stepper */}
        <div className="flex items-center gap-1.5 mb-8 overflow-x-auto pb-2">
          {STEPS.map(({ n, label }, i) => {
            // When customer is pre-filled, show step 2 as "skipped" (completed)
            const isSkipped = n === 2 && !!presetCustomerId
            const isActive = step >= n || isSkipped
            return (
              <div key={n} className="flex items-center gap-1.5 shrink-0">
                <div
                  className={cn(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                    isSkipped && 'opacity-60',
                  )}
                >
                  {n}
                </div>
                <span className={cn('text-xs', isActive ? 'font-medium' : 'text-muted-foreground', isSkipped && 'opacity-60')}>
                  {isSkipped ? '(yo)' : label}
                </span>
                {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
              </div>
            )
          })}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="max-w-lg mx-auto">

          {/* ── Step 1: Corner ─────────────────────────────────────────── */}
          {step === 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paso 1: Selecciona un Corner</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Corner de servicio</Label>
                  <Select value={selectedCornerId} onValueChange={setSelectedCornerId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar corner..." />
                    </SelectTrigger>
                    <SelectContent>
                      {corners.filter((c) => c.isActive).map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} — {c.clientName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {corner && (
                  <div className="text-sm text-muted-foreground bg-muted/50 rounded p-3 space-y-1">
                    {corner.description && <p>{corner.description}</p>}
                  </div>
                )}
                <Button
                  className="w-full"
                  disabled={!selectedCornerId}
                  onClick={() => {
                    if (presetCustomerId) {
                      goToStep(3)
                      loadDevices(presetCustomerId)
                    } else {
                      goToStep(2)
                    }
                  }}
                >
                  Continuar <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ── Step 2: Customer ───────────────────────────────────────── */}
          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paso 2: Selecciona el usuario</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Buscar por nombre o upn..."
                    value={userSearch}
                    onChange={(e) => {
                      setUserSearch(e.target.value)
                      setSelectedUser(null)
                    }}
                  />
                </div>

                {loadingUsers ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Buscando...</p>
                ) : (
                  <div className="space-y-1 max-h-72 overflow-y-auto border rounded-md divide-y">
                    {filteredUsers.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        {userSearch.trim().length < 2 ? 'Escribí al menos 2 caracteres para buscar' : 'Sin resultados'}
                      </p>
                    )}
                    {filteredUsers.map((u) => (
                      <div
                        key={u.id}
                        onClick={() => setSelectedUser(u)}
                        className={cn(
                          'flex items-center gap-3 p-3 cursor-pointer transition-colors',
                          selectedUser?.id === u.id
                            ? 'bg-primary/10'
                            : 'hover:bg-muted/50',
                        )}
                      >
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{u.fullName ?? (`${u.name ?? ''} ${u.lastName ?? ''}`.trim() || 'Sin nombre')}</p>
                          <p className="text-xs text-muted-foreground truncate">{u.upn ?? u.email ?? '—'}</p>
                        </div>
                        {selectedUser?.id === u.id && (
                          <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {selectedUser && (
                  <div className={cn(
                    'text-sm border rounded p-3',
                    selectedUser.companyId
                      ? 'bg-primary/5 border-primary/20'
                      : 'bg-destructive/10 border-destructive/30 text-destructive',
                  )}>
                    <p className="font-medium">{selectedUser.fullName ?? selectedUser.upn ?? selectedUser.email}</p>
                    <p className="text-xs opacity-70">{selectedUser.upn ?? selectedUser.email}</p>
                    {!selectedUser.companyId && (
                      <p className="text-xs mt-1 font-medium">Este usuario no tiene empresa asignada y no puede crear citas.</p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => goToStep(1)}>
                    <ArrowLeft className="h-4 w-4" /> Atrás
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={!selectedUser || !selectedUser.companyId}
                    onClick={() => {
                      goToStep(3)
                      if (selectedUser) loadDevices(selectedUser.id)
                    }}
                  >
                    Continuar <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 3: Device ─────────────────────────────────────────── */}
          {step === 3 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Paso 3: Dispositivo</CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={loadingDevices}
                    onClick={() => selectedUser && loadDevices(selectedUser.id)}
                    className="h-7 gap-1.5 text-xs text-muted-foreground"
                  >
                    <RefreshCw className={cn('h-3.5 w-3.5', loadingDevices && 'animate-spin')} />
                    Actualizar
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {loadingDevices ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Sincronizando con inventario...</p>
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
                        autoFocus
                      />
                    </div>

                    <div className="border rounded-md divide-y max-h-64 overflow-y-auto">
                      {filteredDevices.length > 0 ? (
                        filteredDevices.map((d) => (
                          <div
                            key={d.id}
                            onClick={() => { setSelectedDevice(selectedDevice?.id === d.id ? null : d); setManualSerial('') }}
                            className={cn(
                              'flex items-center gap-3 p-3 cursor-pointer transition-colors',
                              selectedDevice?.id === d.id ? 'bg-primary/10' : 'hover:bg-muted/50',
                            )}
                          >
                            <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">
                                {[d.brand, d.model].filter(Boolean).join(' ') || d.deviceType || 'Dispositivo'}
                              </p>
                              <p className="text-xs text-muted-foreground font-mono">{d.serialNumber}</p>
                            </div>
                            {selectedDevice?.id === d.id && (
                              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                            )}
                          </div>
                        ))
                      ) : deviceSearch.trim() ? (
                        <div
                          onClick={() => { setManualSerial(deviceSearch.trim()); setSelectedDevice(null) }}
                          className={cn(
                            'flex items-center gap-3 p-3 cursor-pointer transition-colors',
                            manualSerial === deviceSearch.trim() ? 'bg-primary/10' : 'hover:bg-muted/50',
                          )}
                        >
                          <Monitor className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium font-mono truncate">{deviceSearch.trim()}</p>
                            <p className="text-xs text-muted-foreground">Usar como número de serie</p>
                          </div>
                          {manualSerial === deviceSearch.trim() && (
                            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5 text-center py-6 px-3">
                          <AlertCircle className="h-5 w-5 text-amber-600" />
                          <p className="text-sm font-medium text-amber-600">
                            Este usuario no tiene dispositivos registrados en el inventario
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Escribí un número de serie arriba para ingresarlo manualmente
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => goToStep(presetCustomerId ? 1 : 2)}>
                    <ArrowLeft className="h-4 w-4" /> Atrás
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={!selectedDevice && !manualSerial.trim()}
                    onClick={() => goToStep(4)}
                  >
                    Continuar <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 4: Issue Type + Description ──────────────────────── */}
          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paso 4: Tipo y descripción</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de cita</Label>
                  <Select
                    value={selectedIssueTypeId}
                    onValueChange={(v) => {
                      // Cambiar el tipo cambia la duración: el horario elegido deja de valer
                      if (v !== selectedIssueTypeId) { setSelectedSlot(null); setSlots([]) }
                      setSelectedIssueTypeId(v)
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredIssueTypes
                        .filter((it) => it.isActive !== false)
                        .map((it) => (
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
                  <div className="text-sm text-muted-foreground bg-muted/50 rounded p-3 space-y-1">
                    {issueType.servicenowCategory && <p>Categoría SN: {issueType.servicenowCategory}</p>}
                    {issueType.workMinutes && <p>Tiempo estimado: {issueType.workMinutes} min</p>}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="description">
                    Descripción <span className="text-destructive">*</span>
                  </Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Describí el motivo de la cita con detalle..."
                    rows={4}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => goToStep(3)}>
                    <ArrowLeft className="h-4 w-4" /> Atrás
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={!selectedIssueTypeId || !description.trim()}
                    onClick={() => goToStep(5)}
                  >
                    Continuar <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 5: Availability ───────────────────────────────────── */}
          {step === 5 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paso 5: Disponibilidad</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fecha</Label>
                    <Input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Duración</Label>
                    <div className="flex items-center h-10 px-3 rounded-md border bg-muted/50 text-sm">
                      {duration} min <span className="text-xs text-muted-foreground ml-1.5">(según tipo)</span>
                    </div>
                  </div>
                </div>

                <Button variant="outline" className="w-full" onClick={checkAvailability} disabled={loadingSlots}>
                  <Calendar className="h-4 w-4" />
                  {loadingSlots ? 'Verificando...' : 'Verificar disponibilidad'}
                </Button>

                {slots.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    <p className="text-sm font-medium">Ventanas disponibles:</p>
                    {slots.filter((s) => s.available).map((slot, i) => (
                      <div
                        key={i}
                        onClick={() => setSelectedSlot(slot)}
                        className={cn(
                          'flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors',
                          selectedSlot?.startTime === slot.startTime
                            ? 'border-primary bg-primary/5'
                            : 'border-border hover:bg-muted/50',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-sm font-medium">{formatDate(slot.startTime)}</p>
                            <p className="text-xs text-muted-foreground">→ {formatDate(slot.endTime)}</p>
                          </div>
                        </div>
                        {slot.technicians && (
                          <Badge variant="secondary">{slot.technicians.available} técnico(s)</Badge>
                        )}
                      </div>
                    ))}
                    {slots.filter((s) => s.available).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Sin disponibilidad para esta fecha</p>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => goToStep(4)}>
                    <ArrowLeft className="h-4 w-4" /> Atrás
                  </Button>
                  <Button className="flex-1" onClick={() => goToStep(6)} disabled={!selectedSlot}>
                    Continuar <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Step 6: Confirm ────────────────────────────────────────── */}
          {step === 6 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paso 6: Confirmar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Corner:</span>
                    <span className="font-medium">{corner?.name ?? selectedCornerId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Usuario:</span>
                    <span className="font-medium">{selectedUser?.fullName ?? selectedUser?.upn ?? selectedUser?.email ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Dispositivo:</span>
                    <span className="font-mono text-xs">{selectedDevice?.serialNumber ?? manualSerial.trim()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tipo:</span>
                    <span className="font-medium">{issueType?.name ?? selectedIssueTypeId}</span>
                  </div>
                  {selectedSlot && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Horario:</span>
                      <span>{formatDate(selectedSlot.startTime)} — {formatDate(selectedSlot.endTime)}</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-1 pt-1 border-t">
                    <span className="text-muted-foreground">Descripción:</span>
                    <p className="text-sm whitespace-pre-wrap">{description}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notas adicionales (opcional)</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Información extra para el técnico..."
                    rows={2}
                  />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => goToStep(5)}>
                    <ArrowLeft className="h-4 w-4" /> Atrás
                  </Button>
                  <Button className="flex-1" onClick={handleSubmit} disabled={loading}>
                    {loading ? 'Creando...' : 'Crear cita'}
                    <CheckCircle2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </div>
    </div>
  )
}
