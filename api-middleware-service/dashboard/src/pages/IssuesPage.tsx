import { useState } from 'react';
import { fetchIssues, Issue } from '../lib/api';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent } from '../components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table';
import { FilterX, RefreshCw, Search } from 'lucide-react';

interface Filters {
  startDate: string;
  endDate: string;
  serviceNowId: string;
  serviceNowTaskNumber: string;
  serviceNowTaskId: string;
  tipology: string;
  descripcion: string;
  customerUser: string;
}

const EMPTY_FILTERS: Filters = {
  startDate: '',
  endDate: '',
  serviceNowId: '',
  serviceNowTaskNumber: '',
  serviceNowTaskId: '',
  tipology: '',
  descripcion: '',
  customerUser: '',
};

type IssuesState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'gateway-down' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; issues: Issue[] };

// date input da 'YYYY-MM-DD', el backend espera ISO 8601 completo
function toISOStart(d: string): string {
  return d ? d + 'T00:00:00.000Z' : '';
}
function toISOEnd(d: string): string {
  return d ? d + 'T23:59:59.999Z' : '';
}

export default function IssuesPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [state, setState] = useState<IssuesState>({ kind: 'idle' });

  const setFilter = (key: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFilters((prev) => ({ ...prev, [key]: e.target.value }));

  const buildParams = (f: Filters): Record<string, string> => {
    const params: Record<string, string> = {};
    if (f.startDate)          params.startDate          = toISOStart(f.startDate);
    if (f.endDate)            params.endDate            = toISOEnd(f.endDate);
    if (f.serviceNowId)       params.serviceNowId       = f.serviceNowId;
    if (f.serviceNowTaskNumber) params.serviceNowTaskNumber = f.serviceNowTaskNumber;
    if (f.serviceNowTaskId)   params.serviceNowTaskId   = f.serviceNowTaskId;
    if (f.tipology)           params.tipology           = f.tipology;
    if (f.descripcion)        params.descripcion        = f.descripcion;
    if (f.customerUser)       params.customerUser       = f.customerUser;
    return params;
  };

  const loadData = async (f: Filters = filters) => {
    setState({ kind: 'loading' });
    try {
      const issues = await fetchIssues(buildParams(f));
      setState({ kind: 'ok', issues });
    } catch (err: unknown) {
      const is503 = err instanceof Error && err.message.includes('503');
      setState(
        is503
          ? { kind: 'gateway-down' }
          : { kind: 'error', message: err instanceof Error ? err.message : 'Error al consultar issues' },
      );
    }
  };

  const handleSearch = () => loadData(filters);

  const handleClear = () => {
    setFilters(EMPTY_FILTERS);
    setState({ kind: 'idle' });
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Issues</h2>

      {/* Filtros */}
      <div className="space-y-4">
        {/* Fechas */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="startDate">Fecha desde</Label>
            <Input
              id="startDate"
              type="date"
              value={filters.startDate}
              onChange={setFilter('startDate')}
              className="w-44"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="endDate">Fecha hasta</Label>
            <Input
              id="endDate"
              type="date"
              value={filters.endDate}
              onChange={setFilter('endDate')}
              className="w-44"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="customerUser">Usuario cliente</Label>
            <Input
              id="customerUser"
              type="text"
              placeholder="usuario@empresa.com"
              value={filters.customerUser}
              onChange={setFilter('customerUser')}
              className="w-52"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="tipology">Tipología</Label>
            <Input
              id="tipology"
              type="text"
              placeholder="Hardware, Software..."
              value={filters.tipology}
              onChange={setFilter('tipology')}
              className="w-44"
            />
          </div>
        </div>

        {/* IDs de ServiceNow */}
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <Label htmlFor="serviceNowId">ServiceNow ID</Label>
            <Input
              id="serviceNowId"
              type="text"
              placeholder="INC0001234"
              value={filters.serviceNowId}
              onChange={setFilter('serviceNowId')}
              className="w-44"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="serviceNowTaskNumber">N° de tarea</Label>
            <Input
              id="serviceNowTaskNumber"
              type="text"
              placeholder="TASK0001234"
              value={filters.serviceNowTaskNumber}
              onChange={setFilter('serviceNowTaskNumber')}
              className="w-44"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="serviceNowTaskId">Task ID</Label>
            <Input
              id="serviceNowTaskId"
              type="text"
              placeholder="sys_id"
              value={filters.serviceNowTaskId}
              onChange={setFilter('serviceNowTaskId')}
              className="w-44"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="descripcion">Descripción</Label>
            <Input
              id="descripcion"
              type="text"
              placeholder="Texto libre..."
              value={filters.descripcion}
              onChange={setFilter('descripcion')}
              className="w-52"
            />
          </div>
        </div>

        {/* Acciones */}
        <div className="flex gap-2">
          <Button size="sm" onClick={handleSearch} disabled={state.kind === 'loading'}>
            <Search className="mr-1.5 h-3.5 w-3.5" />
            Buscar
          </Button>
          {state.kind === 'ok' && (
            <Button variant="outline" size="sm" onClick={handleSearch} disabled={state.kind === 'loading'}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Actualizar
            </Button>
          )}
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={handleClear}>
              <FilterX className="mr-1.5 h-3.5 w-3.5" />
              Limpiar
            </Button>
          )}
        </div>
      </div>

      {/* Resultados */}
      <Card>
        <CardContent className="p-0">
          {state.kind === 'idle' ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Aplicá filtros y presioná Buscar para consultar issues
            </div>
          ) : state.kind === 'loading' ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              Consultando...
            </div>
          ) : state.kind === 'gateway-down' ? (
            <GatewayDownState onRetry={handleSearch} />
          ) : state.kind === 'error' ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-sm">
              <p className="text-destructive font-medium">{state.message}</p>
              <Button variant="outline" size="sm" onClick={handleSearch}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                Reintentar
              </Button>
            </div>
          ) : state.issues.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
              No se encontraron issues con los filtros aplicados
            </div>
          ) : (
            <IssuesTable issues={state.issues} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function IssuesTable({ issues }: { issues: Issue[] }) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>SN ID</TableHead>
            <TableHead>N° Tarea</TableHead>
            <TableHead>Task ID</TableHead>
            <TableHead>Tipología</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Usuario</TableHead>
            <TableHead>Fecha inicio</TableHead>
            <TableHead>Fecha fin</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue, idx) => (
            <TableRow key={issue.id ?? idx}>
              <TableCell className="font-mono text-xs whitespace-nowrap">
                {issue.serviceNowId ?? '—'}
              </TableCell>
              <TableCell className="font-mono text-xs whitespace-nowrap">
                {issue.serviceNowTaskNumber ?? '—'}
              </TableCell>
              <TableCell className="font-mono text-xs whitespace-nowrap">
                {issue.serviceNowTaskId ?? '—'}
              </TableCell>
              <TableCell>
                {issue.tipology
                  ? <Badge variant="secondary">{String(issue.tipology)}</Badge>
                  : '—'}
              </TableCell>
              <TableCell className="max-w-xs truncate text-sm" title={issue.descripcion}>
                {issue.descripcion ?? '—'}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {issue.customerUser ?? '—'}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {issue.startDate ? new Date(String(issue.startDate)).toLocaleString() : '—'}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {issue.endDate ? new Date(String(issue.endDate)).toLocaleString() : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
        <p className="font-medium text-foreground">Servicio no disponible</p>
        <p className="mt-1 text-xs text-muted-foreground">
          El servicio de issues no responde. Verificá que esté activo en el puerto 3003.
        </p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        Reintentar
      </Button>
    </div>
  );
}
