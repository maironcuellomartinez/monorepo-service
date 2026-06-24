import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import type { SnowRequest } from '@/types';
import { History, Search, Filter, RefreshCcw, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 25;

export default function RequestHistoryPage() {
  const [requests, setRequests] = useState<SnowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [filterPriority, setFilterPriority] = useState<string>('todos');
  const [filterType, setFilterType] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 3000);
  };

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await snowQApi.getAllRequests();
      setRequests(data);
    } catch (error) {
      console.error('Failed to load request history:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async (correlationId: string) => {
    setRetryingId(correlationId);
    try {
      await snowQApi.retryRequest(correlationId);
      showFeedback('success', 'Request reencolado');
      await loadHistory();
    } catch {
      showFeedback('error', 'Error al reintentar');
    } finally {
      setRetryingId(null);
    }
  };

  useEffect(() => {
    loadHistory();
  }, []);

  const filteredRequests = requests.filter((request) => {
    const matchesStatus = filterStatus === 'todos' || request.status === filterStatus;
    const matchesPriority = filterPriority === 'todos' || request.priority === filterPriority;
    const matchesType = filterType === 'todos' || request.type === filterType;
    const matchesSearch =
      searchQuery === '' ||
      request.correlationId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      request.internalNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (request.snowNumber || '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesPriority && matchesType && matchesSearch;
  });

  const totalPages = Math.ceil(filteredRequests.length / PAGE_SIZE);
  const pageRows = filteredRequests.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Historial de Requests</h1>
          <p className="text-muted-foreground">Todos los requests procesados</p>
        </div>
        <Button onClick={loadHistory} variant="outline" size="icon" disabled={loading}>
          <RefreshCcw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {feedback && (
        <div className={`rounded-md px-4 py-3 text-sm font-medium ${feedback.type === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
          {feedback.msg}
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtros
          </CardTitle>
          <CardDescription>Buscá y filtrá requests</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 lg:col-span-2">
              <label className="text-sm font-medium">Búsqueda</label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="ID Correlación, Número Interno, o Snow #"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Estado</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los estados" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="QUEUED">EN COLA</SelectItem>
                  <SelectItem value="IN_PROGRESS">EN PROGRESO</SelectItem>
                  <SelectItem value="DELIVERED">ENTREGADO</SelectItem>
                  <SelectItem value="FAILED">FALLIDO</SelectItem>
                  <SelectItem value="CANCELLED">CANCELADO</SelectItem>
                  <SelectItem value="EXPIRED">EXPIRADO</SelectItem>
                  <SelectItem value="DISCARDED">DESCARTADO</SelectItem>
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
                  <SelectItem value="todos">Todas</SelectItem>
                  <SelectItem value="CRITICAL">CRÍTICA</SelectItem>
                  <SelectItem value="HIGH">ALTA</SelectItem>
                  <SelectItem value="MEDIUM">MEDIA</SelectItem>
                  <SelectItem value="LOW">BAJA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Tipo</label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="incident">Incidente</SelectItem>
                  <SelectItem value="problem">Problema</SelectItem>
                  <SelectItem value="change_request">Cambio</SelectItem>
                  <SelectItem value="sc_req_item">Catálogo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Historial de Requests
          </CardTitle>
          <CardDescription>
            {filteredRequests.length} de {requests.length} requests · página {page} de {totalPages || 1}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">
              Cargando...
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-muted-foreground">
              <History className="mb-2 h-12 w-12" />
              <p>No se encontraron requests</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número Interno</TableHead>
                    <TableHead>ID Correlación</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Snow #</TableHead>
                    <TableHead>Reintentos</TableHead>
                    <TableHead>Creado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((request) => (
                    <TableRow key={request.correlationId}>
                      <TableCell className="font-medium">{request.internalNumber}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {request.correlationId.substring(0, 8)}...
                      </TableCell>
                      <TableCell><Badge variant="secondary">{request.type}</Badge></TableCell>
                      <TableCell><PriorityBadge priority={request.priority} /></TableCell>
                      <TableCell><StatusBadge status={request.status} /></TableCell>
                      <TableCell><Badge variant="outline">{request.source}</Badge></TableCell>
                      <TableCell className="font-mono text-sm">{request.snowNumber || '-'}</TableCell>
                      <TableCell className="text-center text-sm">{request.retryCount}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
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

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredRequests.length)} de {filteredRequests.length}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setPage(p => p - 1)} disabled={page === 1}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const variants = {
    CRITICAL: 'destructive',
    HIGH: 'warning',
    MEDIUM: 'default',
    LOW: 'secondary',
  } as Record<string, 'destructive' | 'warning' | 'default' | 'secondary'>;

  return <Badge variant={variants[priority as keyof typeof variants] || 'default'}>{priority}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, 'secondary' | 'default' | 'success' | 'destructive' | 'outline'> = {
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
