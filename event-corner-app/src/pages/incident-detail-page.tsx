import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, AlertCircle, CheckCircle2, Monitor } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { incidentsApi, Incident, IncidentStatus } from '@/lib/api'
import { formatDate, cn } from '@/lib/utils'
import { useAuth } from '@/context/auth'
import { IncidentStatusBadge } from './incidents-page'

const STATUS_ORDER: IncidentStatus[] = [
  'CREATED',
  'DELIVERED',
  'IN_PROGRESS',
  'CLOSED',
  'VALIDATED',
]

export function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [incident, setIncident] = useState<Incident | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')

  const load = async () => {
    if (!id) return
    setLoading(true)
    setError('')
    try {
      const data = await incidentsApi.getById(id)
      setIncident(data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al cargar la incidencia')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  const handleTake = async () => {
    if (!incident || !user?.technicianId) return
    setActionLoading(true)
    setActionError('')
    try {
      await incidentsApi.take(incident.id, { technicianId: user.technicianId })
      navigate('/dashboard')
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setActionError(msg || 'Error al tomar la incidencia')
    } finally {
      setActionLoading(false)
    }
  }

  const handleReopen = async () => {
    if (!incident || !user?.monolithUserId) return
    setActionLoading(true)
    setActionError('')
    try {
      await incidentsApi.reopen(incident.id, user.monolithUserId)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setActionError(msg || 'Error al reabrir la incidencia')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Detalle Incidencia" />
        <div className="flex-1 p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-muted animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (error || !incident) {
    return (
      <div className="flex flex-col h-full">
        <Header title="Detalle Incidencia" />
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error || 'Incidencia no encontrada'}</AlertDescription>
          </Alert>
          <Button variant="outline" className="mt-4" onClick={() => navigate('/incidents')}>
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Button>
        </div>
      </div>
    )
  }

  const statusIdx = STATUS_ORDER.indexOf(incident.status)
  // No se puede tomar en estados terminales (CANCELED/VALIDATED).
  const canTake =
    !incident.currentTechnicianId &&
    !!user?.technicianId &&
    !['CANCELED', 'VALIDATED'].includes(incident.status)
  // CLOSED o CANCELED se pueden reabrir (recuperar sin crear una nueva).
  const canReopen =
    !!user?.monolithUserId && ['CLOSED', 'CANCELED'].includes(incident.status)

  return (
    <div className="flex flex-col h-full">
      <Header title={`Incidencia ${incident.servicenowNumber ?? incident.id.slice(0, 8)}`} onRefresh={load} loading={loading}>
        <Button variant="outline" size="sm" onClick={() => navigate('/incidents')}>
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
              {incident.status === 'REOPENED' && (
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
              <InfoRow label="ID" value={<code className="font-mono text-xs">{incident.id}</code>} />
              <InfoRow label="Estado" value={<IncidentStatusBadge status={incident.status} />} />
              <InfoRow label="Corner" value={incident.corner?.name ?? incident.cornerId} />
              <InfoRow label="Tipo" value={incident.issueType?.name ?? incident.issueTypeId} />
              <InfoRow label="Email cliente" value={incident.customer?.email ?? incident.customerId} />
              {incident.technician && (
                <InfoRow label="Técnico" value={incident.technician.name} />
              )}
              <InfoRow label="Creada" value={formatDate(incident.createdAt)} />
              <InfoRow label="Actualizada" value={formatDate(incident.updatedAt)} />
              {incident.scheduledRange && (
                <>
                  <InfoRow label="Inicio programado" value={formatDate(incident.scheduledRange.start)} />
                  <InfoRow label="Fin programado" value={formatDate(incident.scheduledRange.end)} />
                </>
              )}
              {incident.notes && <InfoRow label="Notas" value={incident.notes} />}
            </CardContent>
          </Card>

          {/* Device info */}
          {(incident.device || incident.deviceId) && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  Dispositivo
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {incident.device ? (
                  <>
                    <InfoRow label="Serial" value={<code className="font-mono text-xs font-semibold">{incident.device.serialNumber}</code>} />
                    {incident.device.brand && incident.device.model && (
                      <InfoRow label="Nombre" value={`${incident.device.brand} ${incident.device.model}`} />
                    )}
                    {incident.device.brand && !incident.device.model && (
                      <InfoRow label="Marca" value={incident.device.brand} />
                    )}
                    {incident.device.model && !incident.device.brand && (
                      <InfoRow label="Modelo" value={incident.device.model} />
                    )}
                  </>
                ) : (
                  <InfoRow label="ID" value={<code className="font-mono text-xs">{incident.deviceId}</code>} />
                )}
              </CardContent>
            </Card>
          )}

          {/* ServiceNow info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">ServiceNow</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <InfoRow
                label="SN Number"
                value={incident.servicenowNumber
                  ? <span className="font-mono font-semibold">{incident.servicenowNumber}</span>
                  : <span className="text-muted-foreground">Pendiente</span>}
              />
              <InfoRow
                label="SN ID (sys_id)"
                value={incident.servicenowId
                  ? <code className="font-mono text-xs">{incident.servicenowId}</code>
                  : <span className="text-muted-foreground">—</span>}
              />
              {incident.snowqCorrelationId && (
                <Alert>
                  <AlertDescription className="text-xs">
                    Correlation ID pendiente de reconciliar: <code className="font-mono">{incident.snowqCorrelationId}</code>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Actions — Tomar / Reabrir según estado */}
        {(canTake || canReopen) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {actionError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{actionError}</AlertDescription>
                </Alert>
              )}
              {canTake && (
                <Button onClick={handleTake} disabled={actionLoading}>
                  {actionLoading ? 'Tomando...' : 'Tomar incidencia'}
                </Button>
              )}
              {canReopen && (
                <Button variant="outline" onClick={handleReopen} disabled={actionLoading}>
                  {actionLoading ? 'Reabriendo...' : 'Reabrir incidencia'}
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
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
