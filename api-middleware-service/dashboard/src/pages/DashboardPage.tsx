import { useEffect, useState } from 'react';
import { fetchClients, fetchHealth, fetchRecords, Client, HealthResponse, RequestRecord } from '../lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table';
import { Skeleton } from '../components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '../components/ui/alert';
import { Users, UserCheck, Activity, Clock } from 'lucide-react';

interface DashboardData {
  totalClients: number;
  activeClients: number;
  healthStatus: string;
  uptime: string;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [recentRecords, setRecentRecords] = useState<RequestRecord[]>([]);
  const [recordsUnavailable, setRecordsUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [clients, health] = await Promise.all([
          fetchClients(),
          fetchHealth(),
        ]);

        if (cancelled) return;

        const uptimeSeconds = Math.floor(health.uptime);
        const hours = Math.floor(uptimeSeconds / 3600);
        const minutes = Math.floor((uptimeSeconds % 3600) / 60);

        setData({
          totalClients: clients.length,
          activeClients: clients.filter((c) => c.isActive).length,
          healthStatus: health.status,
          uptime: `${hours}h ${minutes}m`,
        });
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }

      // Records se carga de forma independiente — si el gateway no está disponible
      // el dashboard sigue mostrando clientes y salud sin colapsar.
      try {
        const records = await fetchRecords({ limit: 5 });
        if (!cancelled) setRecentRecords((records as RequestRecord[]).slice(0, 5));
      } catch {
        if (!cancelled) setRecordsUnavailable(true);
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Dashboard</h2>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Clients</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data?.totalClients ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Clients</CardTitle>
              <UserCheck className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data?.activeClients ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Health Status</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <Badge variant={data?.healthStatus === 'ok' ? 'success' : 'destructive'}>
              {data?.healthStatus ?? 'unknown'}
            </Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Uptime</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data?.uptime ?? '0h 0m'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Recent records */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {recordsUnavailable ? (
            <div className="px-6 py-8 text-center text-sm text-muted-foreground">
              <p className="font-medium">Gateway no disponible</p>
              <p className="mt-1 text-xs">Los registros se cargarán cuando el api-gateway esté activo.</p>
            </div>
          ) : recentRecords.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-mono text-xs">{record.requestNumber}</TableCell>
                    <TableCell>
                      <StatusBadge status={record.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(record.createdAt).toLocaleDateString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="px-6 py-8 text-center text-muted-foreground text-sm">
              No records found
            </div>
          )}
        </CardContent>
      </Card>
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
