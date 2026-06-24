import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, AlertCircle, Calendar, Clock } from 'lucide-react'
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
  cornersApi,
  issueTypesApi,
  availabilityApi,
  requestsApi,
  Corner,
  IssueType,
  AvailabilitySlot,
  ServiceRequest,
} from '@/lib/api'
import { useAuth } from '@/context/auth'
import { formatDate, cn } from '@/lib/utils'

type Step = 1 | 2 | 3 | 4

const DURATIONS = [30, 60, 90, 120]

export function CreateRequestPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  const [step, setStep] = useState<Step>(1)
  const [corners, setCorners] = useState<Corner[]>([])
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([])
  const [slots, setSlots] = useState<AvailabilitySlot[]>([])

  const [selectedCornerId, setSelectedCornerId] = useState('')
  const [selectedIssueTypeId, setSelectedIssueTypeId] = useState('')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [duration, setDuration] = useState(60)
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null)
  const [customerId, setCustomerId] = useState(user?.customerId ?? '')
  const [technicianId, setTechnicianId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [notes, setNotes] = useState('')

  const [loading, setLoading] = useState(false)
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [error, setError] = useState('')
  const [createdRequest, setCreatedRequest] = useState<ServiceRequest | null>(null)

  useEffect(() => {
    Promise.all([cornersApi.list(), issueTypesApi.list()]).then(([c, it]) => {
      setCorners(c)
      setIssueTypes(it)
    })
  }, [])

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
    if (!selectedCornerId || !selectedIssueTypeId || !customerId) {
      setError('Faltan campos obligatorios')
      return
    }
    setLoading(true)
    setError('')
    try {
      const payload: Record<string, unknown> = {
        cornerId: selectedCornerId,
        issueTypeId: selectedIssueTypeId,
        customerId,
        notes,
      }
      if (selectedSlot) {
        payload.scheduledAt = selectedSlot.startTime
      }
      if (technicianId.trim()) payload.technicianId = technicianId.trim()
      if (companyId.trim()) payload.companyId = companyId.trim()

      const req = await requestsApi.create(payload)
      setCreatedRequest(req)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al crear el request')
    } finally {
      setLoading(false)
    }
  }

  const corner = corners.find((c) => c.id === selectedCornerId)
  const issueType = issueTypes.find((it) => it.id === selectedIssueTypeId)

  if (createdRequest) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Nuevo Request" />
        <div className="flex-1 p-6 flex items-center justify-center">
          <Card className="max-w-lg w-full">
            <CardHeader className="text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
              <CardTitle>Request creado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ID:</span>
                  <code className="font-mono text-xs">{createdRequest.id}</code>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Estado:</span>
                  <Badge>{createdRequest.status}</Badge>
                </div>
                {createdRequest.snowqCorrelationId && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground shrink-0">Correlation ID:</span>
                    <code className="font-mono text-xs break-all text-right">{createdRequest.snowqCorrelationId}</code>
                  </div>
                )}
                {createdRequest.servicenowNumber && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">SN Number:</span>
                    <code className="font-mono">{createdRequest.servicenowNumber}</code>
                  </div>
                )}
              </div>
              {createdRequest.snowqCorrelationId && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    El request fue encolado en ServiceNow. Correlation ID:{' '}
                    <code className="font-mono text-xs">{createdRequest.snowqCorrelationId}</code>
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => navigate('/requests')}>
                  Ver requests
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => navigate('/dashboard')}>
                  Dashboard
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
      <Header title="Nuevo Request" />

      <div className="flex-1 p-6 overflow-auto">
        {/* Stepper */}
        <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
          {[
            { n: 1, label: 'Corner' },
            { n: 2, label: 'Tipo' },
            { n: 3, label: 'Disponibilidad' },
            { n: 4, label: 'Detalles' },
          ].map(({ n, label }) => (
            <div key={n} className="flex items-center gap-2 shrink-0">
              <div
                className={cn(
                  'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
                  step >= n ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
                )}
              >
                {n}
              </div>
              <span className={cn('text-sm', step >= n ? 'font-medium' : 'text-muted-foreground')}>
                {label}
              </span>
              {n < 4 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="max-w-lg mx-auto">
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
                  <div className="text-sm text-muted-foreground bg-muted/50 rounded p-3">
                    {corner.country && <p>País: {corner.country}</p>}
                    {corner.description && <p>{corner.description}</p>}
                  </div>
                )}
                <Button className="w-full" disabled={!selectedCornerId} onClick={() => setStep(2)}>
                  Continuar
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          )}

          {step === 2 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paso 2: Tipo de servicio</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Tipo de incidencia/servicio</Label>
                  <Select value={selectedIssueTypeId} onValueChange={setSelectedIssueTypeId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar tipo..." />
                    </SelectTrigger>
                    <SelectContent>
                      {issueTypes
                        .filter((it) => it.isActive !== false)
                        .map((it) => (
                          <SelectItem key={it.id} value={it.id}>
                            {it.name}
                            {it.workMinutes ? ` (${it.workMinutes} min)` : ''}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                {issueType && (
                  <div className="text-sm text-muted-foreground bg-muted/50 rounded p-3 space-y-1">
                    {issueType.description && <p>{issueType.description}</p>}
                    {issueType.workMinutes && <p>Tiempo estimado: {issueType.workMinutes} minutos</p>}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                    <ArrowLeft className="h-4 w-4" />
                    Atrás
                  </Button>
                  <Button className="flex-1" disabled={!selectedIssueTypeId} onClick={() => setStep(3)}>
                    Continuar
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 3 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paso 3: Disponibilidad</CardTitle>
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
                    <Label>Duración (min)</Label>
                    <Select value={String(duration)} onValueChange={(v) => setDuration(Number(v))}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DURATIONS.map((d) => (
                          <SelectItem key={d} value={String(d)}>
                            {d} minutos
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button variant="outline" className="w-full" onClick={checkAvailability} disabled={loadingSlots}>
                  <Calendar className="h-4 w-4" />
                  {loadingSlots ? 'Verificando...' : 'Verificar disponibilidad'}
                </Button>

                {slots.length > 0 && (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    <p className="text-sm font-medium">Ventanas disponibles:</p>
                    {slots
                      .filter((s) => s.available)
                      .map((slot, i) => (
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
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                    <ArrowLeft className="h-4 w-4" />
                    Atrás
                  </Button>
                  <Button className="flex-1" onClick={() => setStep(4)}>
                    {selectedSlot ? 'Continuar' : 'Omitir horario'}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {step === 4 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Paso 4: Detalles</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
                  <p><span className="text-muted-foreground">Corner:</span> {corner?.name ?? selectedCornerId}</p>
                  <p><span className="text-muted-foreground">Tipo:</span> {issueType?.name ?? selectedIssueTypeId}</p>
                  {selectedSlot && (
                    <p>
                      <span className="text-muted-foreground">Horario:</span>{' '}
                      {formatDate(selectedSlot.startTime)} — {formatDate(selectedSlot.endTime)}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customerId">Customer ID</Label>
                  <Input
                    id="customerId"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    placeholder="UUID del cliente"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="technicianId">
                    Técnico ID <span className="text-muted-foreground text-xs">(opcional)</span>
                  </Label>
                  <Input
                    id="technicianId"
                    value={technicianId}
                    onChange={(e) => setTechnicianId(e.target.value)}
                    placeholder="UUID del técnico"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="companyId">
                    Company ID <span className="text-muted-foreground text-xs">(opcional)</span>
                  </Label>
                  <Input
                    id="companyId"
                    value={companyId}
                    onChange={(e) => setCompanyId(e.target.value)}
                    placeholder="UUID de la empresa"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notas</Label>
                  <Textarea
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Detalles del servicio requerido..."
                    rows={4}
                  />
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(3)}>
                    <ArrowLeft className="h-4 w-4" />
                    Atrás
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={loading || !customerId}
                  >
                    {loading ? 'Creando...' : 'Crear request'}
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
