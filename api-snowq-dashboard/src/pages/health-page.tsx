import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { snowQApi } from '@/lib/api';
import type { HealthStatus } from '@/types';
import { Activity, CheckCircle2, XCircle, Clock, Database, Server, Zap, RefreshCcw } from 'lucide-react';

export default function HealthPage() {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHealth = async () => {
    try {
      const data = await snowQApi.getHealth();
      setHealth(data);
    } catch (error) {
      console.error('Failed to load health status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHealth();
    const interval = setInterval(loadHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Activity className="mx-auto h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Loading health status...</p>
        </div>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <XCircle className="mx-auto h-12 w-12 text-red-600" />
          <p className="mt-4 font-semibold text-red-600">No se pudo conectar con el servicio</p>
          <p className="mt-1 text-sm text-muted-foreground">Verifica que api-snowq-service esté corriendo en :3090</p>
          <Button className="mt-4" onClick={loadHealth}>Reintentar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Health Status</h1>
          <p className="text-muted-foreground">
            System health checks and component status
          </p>
        </div>
        <Button onClick={loadHealth} variant="outline" size="icon">
          <RefreshCcw className="h-5 w-5" />
        </Button>
      </div>

      {/* Overall Status */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Overall Status
          </CardTitle>
          <CardDescription>System-wide health status</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {health?.status === 'ok' && (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-green-600">Healthy</p>
                  <p className="text-muted-foreground">All systems operational</p>
                </div>
              </>
            )}
            {health?.status === 'degraded' && (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-yellow-100">
                  <Clock className="h-8 w-8 text-yellow-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-yellow-600">Degraded</p>
                  <p className="text-muted-foreground">Some components experiencing issues</p>
                </div>
              </>
            )}
            {health?.status === 'error' && (
              <>
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                  <XCircle className="h-8 w-8 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-red-600">Unhealthy</p>
                  <p className="text-muted-foreground">Critical components down</p>
                </div>
              </>
            )}
            <div className="ml-auto text-right">
              <p className="text-sm text-muted-foreground">Uptime</p>
              <p className="text-lg font-mono font-bold">
                {formatUptime(health?.uptime || 0)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Component Health */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Database */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Database
            </CardTitle>
            <CardDescription>MySQL connection status</CardDescription>
          </CardHeader>
          <CardContent>
            {health?.checks.database ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Status</span>
                  <Badge
                    variant={
                      health.checks.database.status === 'up' ? 'success' : 'destructive'
                    }
                  >
                    {health.checks.database.status}
                  </Badge>
                </div>
                {health.checks.database.responseTimeMs && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Response Time
                    </span>
                    <span className="font-mono text-sm">
                      {health.checks.database.responseTimeMs} ms
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not configured</p>
            )}
          </CardContent>
        </Card>

        {/* ServiceNow */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              ServiceNow
            </CardTitle>
            <CardDescription>ServiceNow API connection</CardDescription>
          </CardHeader>
          <CardContent>
            {health?.checks.servicenow ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Status</span>
                  <Badge
                    variant={
                      health.checks.servicenow.status === 'up' ? 'success' : 'destructive'
                    }
                  >
                    {health.checks.servicenow.status}
                  </Badge>
                </div>
                {health.checks.servicenow.responseTimeMs && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Response Time
                    </span>
                    <span className="font-mono text-sm">
                      {health.checks.servicenow.responseTimeMs} ms
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not configured</p>
            )}
          </CardContent>
        </Card>

        {/* Circuit Breaker */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Circuit Breaker
            </CardTitle>
            <CardDescription>Opossum circuit breaker status</CardDescription>
          </CardHeader>
          <CardContent>
            {health?.checks.circuitBreaker ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Status</span>
                  <Badge
                    variant={
                      health.checks.circuitBreaker.status === 'up' ? 'success' : 'destructive'
                    }
                  >
                    {health.checks.circuitBreaker.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">State</span>
                  <Badge variant="secondary">
                    {health.checks.circuitBreaker.state}
                  </Badge>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not configured</p>
            )}
          </CardContent>
        </Card>

        {/* Queue */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Queue
            </CardTitle>
            <CardDescription>Request queue status</CardDescription>
          </CardHeader>
          <CardContent>
            {health?.checks.queue ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Status</span>
                  <Badge
                    variant={
                      health.checks.queue.status === 'up' ? 'success' : 'destructive'
                    }
                  >
                    {health.checks.queue.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Pending Requests
                  </span>
                  <span className="font-mono text-sm">
                    {health.checks.queue.pendingCount}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not configured</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
          <CardDescription>Service details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <InfoItem label="Service" value="api-snowq-service" />
            <InfoItem label="Version" value="1.0.0" />
            <InfoItem
              label="Last Check"
              value={health?.timestamp ? new Date(health.timestamp).toLocaleString() : 'N/A'}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function InfoItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
