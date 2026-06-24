import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { snowQApi } from '@/lib/api';
import type { SnowRequest, DlqStats, DlqFilter } from '@/types';
import {
  AlertTriangle, RefreshCcw, RotateCcw, Trash2, ChevronLeft,
  ChevronRight, BarChart2, Clock, Filter,
} from 'lucide-react';

const PAGE_SIZE = 20;

export default function DlqPage() {
  const [failed, setFailed] = useState<SnowRequest[]>([]);
  const [stats, setStats] = useState<DlqStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Filtros
  const [filterType, setFilterType] = useState('todos');
  const [filterSource, setFilterSource] = useState('');
  const [filterSince, setFilterSince] = useState('');
  const [filterUntil, setFilterUntil] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Paginación
  const [page, setPage] = useState(1);

  // Confirmación de descarte
  const [confirmDiscard, setConfirmDiscard] = useState<'single' | 'bulk' | null>(null);
  const [confirmCorrelationId, setConfirmCorrelationId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [failedData, statsData] = await Promise.all([
        snowQApi.getFailedRequests(),
        snowQApi.getDlqStats(),
      ]);
      setFailed(failedData);
      setStats(statsData);
    } catch (err) {
      console.error('DLQ load error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  const showFeedback = (type: 'success' | 'error', msg: string) => {
    setFeedback({ type, msg });
    setTimeout(() => setFeedback(null), 4000);
  };

  const buildFilter = (): DlqFilter => ({
    type: filterType !== 'todos' ? filterType : undefined,
    source: filterSource || undefined,
    since: filterSince || undefined,
    until: filterUntil || undefined,
  });

  const handleRetryOne = async (correlationId: string) => {
    setActionLoading(correlationId);
    try {
      await snowQApi.retryRequest(correlationId);
      showFeedback('success', 'Request reencolado correctamente');
      await load();
    } catch {
      showFeedback('error', 'Error al reintentar el request');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryFiltered = async () => {
    setActionLoading('retry-filtered');
    try {
      const count = await snowQApi.retryFiltered(buildFilter());
      showFeedback('success', `${count} request(s) reencolados`);
      await load();
    } catch {
      showFeedback('error', 'Error al reintentar con filtro');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRetryAll = async () => {
    setActionLoading('retry-all');
    try {
      const count = await snowQApi.retryAllFailed();
      showFeedback('success', `${count} request(s) reencolados`);
      await load();
    } catch {
      showFeedback('error', 'Error al reintentar todos');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDiscardOne = async () => {
    if (!confirmCorrelationId) return;
    setActionLoading(confirmCorrelationId);
    setConfirmDiscard(null);
    try {
      await snowQApi.discardFailed(confirmCorrelationId);
      showFeedback('success', 'Request descartado');
      await load();
    } catch {
      showFeedback('error', 'Error al descartar');
    } finally {
      setActionLoading(null);
      setConfirmCorrelationId(null);
    }
  };

  const handleDiscardFiltered = async () => {
    setConfirmDiscard(null);
    setActionLoading('discard-filtered');
    try {
      const count = await snowQApi.discardFiltered(buildFilter());
      showFeedback('success', `${count} request(s) descartados`);
      await load();
    } catch {
      showFeedback('error', 'Error al descartar con filtro');
    } finally {
      setActionLoading(null);
    }
  };

  // Filtro client-side para la tabla
  const displayRows = failed.filter((r) => {
    const matchesType = filterType === 'todos' || r.type === filterType;
    const matchesSource = !filterSource || r.source.includes(filterSource);
    const matchesSince = !filterSince || new Date(r.updatedAt) >= new Date(filterSince);
    const matchesUntil = !filterUntil || new Date(r.updatedAt) <= new Date(filterUntil);
    const matchesSearch =
      !searchQuery ||
      r.internalNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.correlationId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.lastError ?? '').toLowerCase().includes(searchQuery.toLowerCase());
    return matchesType && matchesSource && matchesSince && matchesUntil && matchesSearch;
  });

  const totalPages = Math.ceil(displayRows.length / PAGE_SIZE);
  const pageRows = displayRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dead Letter Queue</h1>
          <p className="text-muted-foreground">
            Requests que agotaron reintentos — gestión manual de recuperación
          </p>
        </div>
        <Button onClick={load} variant="outline" size="icon" disabled={loading}>
          <RefreshCcw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Feedback */}
      {feedback && (
        <div
          className={`rounded-md px-4 py-3 text-sm font-medium ${
            feedback.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {feedback.msg}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total en DLQ"
            value={stats.total}
            icon={<AlertTriangle className="h-5 w-5 text-red-500" />}
            color="text-red-600"
          />
          <StatCard
            title="Más antiguo"
            value={stats.oldest ? formatAge(stats.oldest) : '—'}
            icon={<Clock className="h-5 w-5 text-orange-500" />}
            color="text-orange-600"
            isText
          />
          <StatCard
            title="Tipos afectados"
            value={Object.keys(stats.byType).length}
            icon={<BarChart2 className="h-5 w-5 text-blue-500" />}
            color="text-blue-600"
          />
          <StatCard
            title="Error más frecuente"
            value={stats.byErrorPattern[0]?.count ?? 0}
            subtext={stats.byErrorPattern[0]?.error.substring(0, 40) ?? '—'}
            icon={<AlertTriangle className="h-5 w-5 text-yellow-500" />}
            color="text-yellow-600"
          />
        </div>
      )}

      {/* Breakdown panels */}
      {stats && stats.total > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Por tipo */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Por Tipo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {Object.entries(stats.byType).map(([type, count]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <Badge variant="secondary">{type}</Badge>
                  <span className="font-medium">{count}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Top errores */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Errores</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {stats.byErrorPattern.slice(0, 6).map(({ error, count }, i) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="truncate max-w-[280px]" title={error}>{error}</span>
                    <span className="shrink-0 ml-2 font-medium text-foreground">{count}×</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-red-400 rounded-full"
                      style={{ width: `${Math.min(100, (count / (stats.byErrorPattern[0]?.count || 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filtros + acciones bulk */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros y Acciones en Lote
          </CardTitle>
          <CardDescription>
            Los filtros aplican a la tabla y a las acciones de reintento/descarte en lote
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <label className="text-sm font-medium">Tipo</label>
              <Select value={filterType} onValueChange={(v) => { setFilterType(v); setPage(1); }}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="incident">Incidente</SelectItem>
                  <SelectItem value="problem">Problema</SelectItem>
                  <SelectItem value="change_request">Cambio</SelectItem>
                  <SelectItem value="sc_req_item">Catálogo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Origen</label>
              <Input
                placeholder="monolith, nagios-thruk…"
                value={filterSource}
                onChange={(e) => { setFilterSource(e.target.value); setPage(1); }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Desde (updatedAt)</label>
              <Input
                type="datetime-local"
                value={filterSince}
                onChange={(e) => { setFilterSince(e.target.value); setPage(1); }}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Hasta (updatedAt)</label>
              <Input
                type="datetime-local"
                value={filterUntil}
                onChange={(e) => { setFilterUntil(e.target.value); setPage(1); }}
              />
            </div>
          </div>

          {/* Acciones bulk */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
            <span className="text-sm text-muted-foreground mr-2">
              {displayRows.length} registro(s) coinciden con el filtro
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetryFiltered}
              disabled={!!actionLoading || displayRows.length === 0}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {actionLoading === 'retry-filtered' ? 'Reencolando…' : 'Reintentar filtrados'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetryAll}
              disabled={!!actionLoading || failed.length === 0}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              {actionLoading === 'retry-all' ? 'Reencolando…' : `Reintentar todos (${failed.length})`}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => setConfirmDiscard('bulk')}
              disabled={!!actionLoading || displayRows.length === 0}
            >
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Descartar filtrados
            </Button>
          </div>

          {/* Confirmación descarte en lote */}
          {confirmDiscard === 'bulk' && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 flex items-center justify-between gap-4">
              <p className="text-sm text-red-800">
                ¿Descartar <strong>{displayRows.length}</strong> registro(s)? Esta acción no se puede deshacer.
              </p>
              <div className="flex gap-2 shrink-0">
                <Button size="sm" variant="outline" onClick={() => setConfirmDiscard(null)}>Cancelar</Button>
                <Button size="sm" variant="destructive" onClick={handleDiscardFiltered}>Confirmar</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Búsqueda rápida */}
      <div className="relative">
        <Input
          placeholder="Buscar por número interno, correlationId o mensaje de error…"
          value={searchQuery}
          onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
          className="pl-4"
        />
      </div>

      {/* Tabla */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            Requests en DLQ
          </CardTitle>
          <CardDescription>
            {displayRows.length} resultados · página {page} de {totalPages || 1}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex h-48 items-center justify-center text-muted-foreground">Cargando…</div>
          ) : pageRows.length === 0 ? (
            <div className="flex h-48 flex-col items-center justify-center text-muted-foreground">
              <AlertTriangle className="mb-2 h-12 w-12 text-green-400" />
              <p>No hay registros en la DLQ</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Número Interno</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Prioridad</TableHead>
                    <TableHead>Origen</TableHead>
                    <TableHead>Reintentos</TableHead>
                    <TableHead>Último error</TableHead>
                    <TableHead>Actualizado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((r) => (
                    <TableRow key={r.correlationId}>
                      <TableCell className="font-medium">{r.internalNumber}</TableCell>
                      <TableCell><Badge variant="secondary">{r.type}</Badge></TableCell>
                      <TableCell><PriorityBadge priority={r.priority} /></TableCell>
                      <TableCell><Badge variant="outline">{r.source}</Badge></TableCell>
                      <TableCell className="text-center">{r.retryCount}</TableCell>
                      <TableCell
                        className="max-w-[240px] truncate text-xs text-muted-foreground"
                        title={r.lastError ?? ''}
                      >
                        {r.lastError ?? '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(r.updatedAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {confirmDiscard === 'single' && confirmCorrelationId === r.correlationId ? (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="outline" onClick={() => { setConfirmDiscard(null); setConfirmCorrelationId(null); }}>
                              No
                            </Button>
                            <Button size="sm" variant="destructive" onClick={handleDiscardOne}>
                              Descartar
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRetryOne(r.correlationId)}
                              disabled={!!actionLoading}
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => { setConfirmDiscard('single'); setConfirmCorrelationId(r.correlationId); }}
                              disabled={!!actionLoading}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <p className="text-sm text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, displayRows.length)} de {displayRows.length}
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

function StatCard({
  title, value, icon, color, subtext, isText,
}: {
  title: string; value: number | string; icon: React.ReactNode;
  color: string; subtext?: string; isText?: boolean;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">{title}</p>
            <p className={`${isText ? 'text-lg' : 'text-2xl'} font-bold ${color}`}>{value}</p>
            {subtext && <p className="text-xs text-muted-foreground truncate max-w-[160px]" title={subtext}>{subtext}</p>}
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const variants: Record<string, 'destructive' | 'warning' | 'default' | 'secondary'> = {
    CRITICAL: 'destructive', HIGH: 'warning', MEDIUM: 'default', LOW: 'secondary',
  };
  return <Badge variant={variants[priority] ?? 'default'}>{priority}</Badge>;
}

function formatAge(isoDate: string): string {
  const diffMs = Date.now() - new Date(isoDate).getTime();
  const h = Math.floor(diffMs / 3_600_000);
  if (h < 1) return `${Math.floor(diffMs / 60_000)} min`;
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}
