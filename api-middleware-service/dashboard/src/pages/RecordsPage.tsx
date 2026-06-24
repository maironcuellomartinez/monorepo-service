import { useEffect, useState } from 'react';
import { fetchRecords, RequestRecord } from '../lib/api';
import { Badge } from '../components/ui/badge';
import { Select } from '../components/ui/select';
import { Label } from '../components/ui/label';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table';
import { FilterX, RefreshCw } from 'lucide-react';

// Estados reales del monolith
const STATUSES = [
  'CREATED',
  'DELIVERED',
  'IN_PROGRESS',
  'PAUSED',
  'CLOSED',
  'VALIDATED',
  'REOPENED',
];

type RecordsState =
  | { kind: 'loading' }
  | { kind: 'gateway-down' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; records: RequestRecord[] };

interface Filters {
  status: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: Filters = { status: '', dateFrom: '', dateTo: '' };

export default function RecordsPage() {
  const [state, setState] = useState<RecordsState>({ kind: 'loading' });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const setFilter = (key: keyof Filters) => (value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  const loadData = async (f: Filters = filters) => {
    setState({ kind: 'loading' });
    try {
      const params: Record<string, string> = {};
      if (f.status)   params.status   = f.status;
      if (f.dateFrom) params.dateFrom = f.dateFrom;
      if (f.dateTo)   params.dateTo   = f.dateTo;

      const data = await fetchRecords(params);
      setState({ kind: 'ok', records: data as RequestRecord[] });
    } catch (err: unknown) {
      const is503 = err instanceof Error && err.message.includes('503');
      setState(
        is503
          ? { kind: 'gateway-down' }
          : { kind: 'error', message: err instanceof Error ? err.message : 'Error al cargar registros' },
      );
    }
  };

  useEffect(() => {
    loadData(filters);
  }, [filters.status, filters.dateFrom, filters.dateTo]);

  const handleClear = () => {
    setFilters(EMPTY_FILTERS);
  };

  const hasActiveFilters = filters.status || filters.dateFrom || filters.dateTo;

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Records</h2>

      {/* Filtros reales del monolith */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="status">Estado</Label>
          <Select
            id="status"
            value={filters.status}
            onChange={(e) => setFilter('status')(e.target.value)}
          >
            <option value="">Todos</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="dateFrom">Desde</Label>
          <Input
            id="dateFrom"
            type="date"
            value={filters.dateFrom}
            onChange={(e) => setFilter('dateFrom')(e.target.value)}
            className="w-40"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dateTo">Hasta</Label>
          <Input
            id="dateTo"
            type="date"
            value={filters.dateTo}
            onChange={(e) => setFilter('dateTo')(e.target.value)}
            className="w-40"
          />
        </div>

        <div className="flex gap-2">
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClear}>
              <FilterX className="mr-1.5 h-3.5 w-3.5" />
              Limpiar
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => loadData(filters)}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Actualizar
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {state.kind === 'loading' ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Cargando registros...
            </div>
          ) : state.kind === 'gateway-down' ? (
            <GatewayDownState onRetry={() => loadData(filters)} />
          ) : state.kind === 'error' ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-sm">
              <p className="text-destructive font-medium">{state.message}</p>
              <Button variant="outline" size="sm" onClick={() => loadData(filters)}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Reintentar
              </Button>
            </div>
          ) : state.records.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              No se encontraron registros
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead>Actualizado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-mono text-xs">{record.requestNumber}</TableCell>
                    <TableCell>
                      <StatusBadge status={record.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(record.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                      {new Date(record.updatedAt).toLocaleString()}
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

function GatewayDownState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-3 text-center px-6">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-muted">
        <span className="text-xl">⚡</span>
      </div>
      <div>
        <p className="font-medium text-foreground">Gateway no disponible</p>
        <p className="mt-1 text-xs text-muted-foreground">
          El api-gateway no responde. Verificá que esté activo en el puerto 3000.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        Reintentar
      </Button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variantMap: Record<string, 'success' | 'warning' | 'destructive' | 'info' | 'secondary'> = {
    CREATED:     'info',
    DELIVERED:   'info',
    IN_PROGRESS: 'warning',
    PAUSED:      'secondary',
    CLOSED:      'secondary',
    VALIDATED:   'success',
    REOPENED:    'warning',
  };

  return (
    <Badge variant={variantMap[status.toUpperCase()] ?? 'secondary'}>
      {status.replace('_', ' ')}
    </Badge>
  );
}
