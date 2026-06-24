import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ClipboardList, AlertCircle } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { requestsApi, ServiceRequest, RequestStatus } from '@/lib/api'
import { useAuth } from '@/context/auth'
import { formatDate, cn } from '@/lib/utils'

const STATUS_CONFIG: Record<RequestStatus, { label: string; className: string }> = {
  CREATED: { label: 'Creado', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' },
  IN_PROGRESS: { label: 'En progreso', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' },
  CLOSED: { label: 'Cerrado', className: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' },
  CANCELLED: { label: 'Cancelado', className: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200' },
}

function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: '' }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold', config.className)}>
      {config.label}
    </span>
  )
}

export function RequestsPage() {
  const navigate = useNavigate()
  const { user, can } = useAuth()
  const [requests, setRequests] = useState<ServiceRequest[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await requestsApi.list({ customerId: user?.customerId })
      setRequests(data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al cargar requests')
      setRequests([])
    } finally {
      setLoading(false)
    }
  }, [user?.customerId])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="flex flex-col h-full">
      <Header title="Requests" onRefresh={load} loading={loading}>
        {can('request:create') && (
          <Button onClick={() => navigate('/requests/new')}>
            <Plus className="h-4 w-4" />
            Nuevo Request
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

        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {loading ? 'Cargando...' : `${requests.length} request(s) para tu cuenta`}
          </p>
        </div>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded" />
            ))}
          </div>
        ) : requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <ClipboardList className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No hay requests para tu cuenta</p>
            {can('request:create') && (
              <Button className="mt-4" onClick={() => navigate('/requests/new')}>
                <Plus className="h-4 w-4" />
                Crear request
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Corner</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>SN Number</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.map((req) => (
                  <TableRow
                    key={req.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/requests/${req.id}`)}
                  >
                    <TableCell className="font-mono text-xs">
                      {req.id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <RequestStatusBadge status={req.status} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {req.corner?.name ?? req.cornerId?.slice(0, 8) ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {req.issueType?.name ?? req.issueTypeId?.slice(0, 8) ?? '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(req.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm font-mono">
                      {req.servicenowNumber ?? '—'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          navigate(`/requests/${req.id}`)
                        }}
                      >
                        Ver
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
