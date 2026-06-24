import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { snowQApi } from '@/lib/api';
import type { SnowRequest, RequestPriority } from '@/types';
import { Clock, RefreshCcw, RotateCcw } from 'lucide-react';

export default function QueueManagementPage() {
  const [allRequests, setAllRequests] = useState<SnowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [filterPriority, setFilterPriority] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const loadQueue = async () => {
    try {
      const data = await snowQApi.getAllRequests();
      const processingRequests = data.filter(
        r => r.status === 'QUEUED' || r.status === 'IN_PROGRESS' || r.status === 'FAILED',
      );
      setAllRequests(processingRequests);
    } catch (error) {
      console.error('Failed to load requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (correlationId: string) => {
    setRetryingId(correlationId);
    try {
      await snowQApi.retryRequest(correlationId);
      showFeedback('success', 'Request reencolado');
      await loadQueue();
    } catch {
      showFeedback('error', 'Error al reintentar');
    } finally {
      setRetryingId(null);
    }
  };

  useEffect(() => {
    loadQueue();
    const interval = setInterval(loadQueue, 10000); // Poll every 10 seconds
    return () => clearInterval(interval);
  }, []);

  const filteredRequests = allRequests.filter((request) => {
    const matchesStatus = filterStatus === 'todos' || request.status === filterStatus;
    const matchesPriority = filterPriority === 'todos' || request.priority === filterPriority;
    const matchesSearch =
      searchQuery === '' ||
      request.correlationId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.internalNumber.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesPriority && matchesSearch;
  });

  const stats = {
    total: allRequests.length,
    queued: allRequests.filter((r) => r.status === 'QUEUED').length,
    inProgress: allRequests.filter((r) => r.status === 'IN_PROGRESS').length,
    failed: allRequests.filter((r) => r.status === 'FAILED').length,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cola de Requests</h1>
          <p className="text-muted-foreground">
            Requests actuales en procesamiento (QUEUED o IN_PROGRESS)
          </p>
        </div>
        <Button onClick={loadQueue} variant="outline" size="icon">
          <RefreshCcw className="h-5 w-5" />
        </Button>
      </div>

      {feedback && (
        <div className={`rounded-md px-4 py-3 text-sm font-medium ${feedback.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {feedback.msg}
        </div>
      )}

      {/* Queue Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <QueueStatCard label="En Cola" value={stats.queued} color="text-yellow-600" />
        <QueueStatCard label="En Progreso" value={stats.inProgress} color="text-blue-600" />
        <QueueStatCard label="Fallidos" value={stats.failed} color="text-red-600" />
        <QueueStatCard label="Total" value={stats.total} color="text-gray-600" />
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filtros</CardTitle>
          <CardDescription>Filtra requests por estado, prioridad o búsqueda</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos los Estados</SelectItem>
                  <SelectItem value="QUEUED">EN COLA</SelectItem>
                  <SelectItem value="IN_PROGRESS">EN PROGRESO</SelectItem>
                  <SelectItem value="DELIVERED">ENTREGADO</SelectItem>
                  <SelectItem value="FAILED">FALLIDO</SelectItem>
                  <SelectItem value="CANCELLED">CANCELADO</SelectItem>
                  <SelectItem value="FAILED">FALLIDO</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Prioridad</label>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas las prioridades" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas las Prioridades</SelectItem>
                  <SelectItem value="CRITICAL">CRÍTICA</SelectItem>
                  <SelectItem value="HIGH">ALTA</SelectItem>
                  <SelectItem value="MEDIUM">MEDIA</SelectItem>
                  <SelectItem value="LOW">BAJA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Búsqueda</label>
              <div className="relative">
                <input
                  placeholder="ID de Correlación o Número Interno"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm pl-8"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Queue Table */}
      <Card>
        <CardHeader>
          <CardTitle>Requests en Cola</CardTitle>
          <CardDescription>
            {filteredRequests.length} de {allRequests.length} requests mostrados
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              Cargando...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-muted-foreground">
              <Clock className="mb-2 h-12 w-12" />
              <p>No hay requests en cola</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número Interno</TableHead>
                  <TableHead>ID Correlación</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Número Snow</TableHead>
                  <TableHead>Reintentos</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.correlationId}>
                    <TableCell className="font-medium">{request.internalNumber}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {request.correlationId.substring(0, 8)}...
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{request.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <PriorityBadge priority={request.priority} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={request.status} />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {request.snowNumber || '-'}
                    </TableCell>
                    <TableCell>
                      {request.retryCount}/{request.maxRetries}
                    </TableCell>
                    <TableCell>
                      {new Date(request.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {request.status === 'FAILED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRetry(request.correlationId)}
                          disabled={retryingId === request.correlationId}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QueueStatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className={`text-2xl font-bold ${color}`}>{value}</div>
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function PriorityBadge({ priority }: { priority: RequestPriority }) {
  const variants = {
    CRITICAL: 'destructive',
    HIGH: 'warning',
    MEDIUM: 'default',
    LOW: 'secondary',
  } as const;

  return <Badge variant={variants[priority]}>{priority}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'secondary' | 'default' | 'success' | 'destructive' | 'outline' | 'warning'> = {
    QUEUED: 'secondary',
    IN_PROGRESS: 'default',
    DELIVERED: 'success',
    FAILED: 'destructive',
    CANCELLED: 'outline',
    EXPIRED: 'outline',
    DISCARDED: 'outline',
  };
  return <Badge variant={variants[status] ?? 'outline'}>{status}</Badge>;
}
