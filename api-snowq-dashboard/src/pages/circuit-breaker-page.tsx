import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { snowQApi } from '@/lib/api';
import type { CircuitBreakerStatus, CircuitState } from '@/types';
import { Zap, RefreshCcw, Shield, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

export default function CircuitBreakerStatusPage() {
  const [status, setStatus] = useState<CircuitBreakerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);

  const loadStatus = async () => {
    try {
      const data = await snowQApi.getCircuitBreakerStatus();
      setStatus(data);
    } catch (error) {
      console.error('Failed to load circuit breaker status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    loadStatus();
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await snowQApi.resetCircuitBreaker();
      await loadStatus();
      alert('Circuit Breaker reseteado exitosamente');
    } catch (error: any) {
      alert('Error al resetear: ' + (error.message || 'No se pudo resetear'));
    } finally {
      setResetting(false);
    }
  };

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Zap className="mx-auto h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Cargando estado del circuit breaker...</p>
        </div>
      </div>
    );
  }

  const getStateColor = (state: CircuitState) => {
    switch (state) {
      case 'closed':
        return 'text-green-600';
      case 'open':
        return 'text-red-600';
      case 'half-open':
        return 'text-yellow-600';
      default:
        return 'text-gray-600';
    }
  };

  const getStateIcon = (state: CircuitState) => {
    switch (state) {
      case 'closed':
        return CheckCircle2;
      case 'open':
        return AlertTriangle;
      case 'half-open':
        return Clock;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Circuit Breaker</h1>
          <p className="text-muted-foreground">
            Opossum circuit breaker status and configuration
          </p>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="icon" title="Recargar estado">
          <RefreshCcw className="h-5 w-5" />
        </Button>
      </div>

      {/* Main Status Card */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Current State
            </div>
            {status && (
              <Button
                onClick={handleReset}
                variant="outline"
                size="sm"
                disabled={resetting || status.state === 'closed'}
                className="text-xs"
                title={status.state === 'closed' ? 'Solo se puede resetear cuando está OPEN o HALF-OPEN' : undefined}
              >
                <Shield className="mr-1 h-3 w-3" />
                {resetting ? 'Reseteando...' : 'Resetear'}
              </Button>
            )}
          </CardTitle>
          <CardDescription>Real-time circuit breaker state</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {status && (
                <>
                  {(() => {
                    const StateIcon = getStateIcon(status.state);
                    return (
                      <div
                        className={`flex h-20 w-20 items-center justify-center rounded-full border-4 ${getStateColor(
                          status.state
                        )} border-current`}
                      >
                        <StateIcon className="h-10 w-10" />
                      </div>
                    );
                  })()}
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          status.state === 'closed'
                            ? 'success'
                            : status.state === 'open'
                            ? 'destructive'
                            : 'warning'
                        }
                        className="text-sm"
                      >
                        {status.state.toUpperCase()}
                      </Badge>
                      <span className="text-2xl font-bold">{status.state}</span>
                    </div>
                    <p className="text-muted-foreground">
                      {status.state === 'closed' && 'Circuit is closed - requests flowing normally'}
                      {status.state === 'open' && 'Circuit is open - requests are being rejected'}
                      {status.state === 'half-open' &&
                        'Circuit is half-open - testing if service recovered'}
                    </p>
                  </div>
                </>
              )}
            </div>
            {status?.nextAttemptTime && status.state === 'open' && (
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Next attempt in</p>
                <p className="text-lg font-mono font-bold">
                  {formatTimeUntil(new Date(status.nextAttemptTime))}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Metrics Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Failure Rate"
          value={status?.failureRate.toFixed(2) ?? '0.00'}
          suffix="%"
          description="Current failure percentage"
          icon={AlertTriangle}
          color={status && status.failureRate > 50 ? 'text-red-600' : 'text-green-600'}
        />
        <MetricCard
          title="Total Requests"
          value={status?.totalRequests.toLocaleString() ?? '0'}
          description="All-time requests"
          icon={Zap}
        />
        <MetricCard
          title="Total Successes"
          value={status?.totalSuccesses.toLocaleString() ?? '0'}
          description="Successful requests"
          icon={CheckCircle2}
          color="text-green-600"
        />
        <MetricCard
          title="Total Failures"
          value={status?.totalFailures.toLocaleString() ?? '0'}
          description="Failed requests"
          icon={AlertTriangle}
          color="text-red-600"
        />
      </div>

      {/* Detailed Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Request Statistics</CardTitle>
            <CardDescription>Current session statistics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Success Rate</span>
                <span className="font-medium">
                  {status
                    ? ((status.successCount / Math.max(status.totalRequests, 1)) * 100).toFixed(1)
                    : '0.0'}
                  %
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${
                      status
                        ? (status.successCount / Math.max(status.totalRequests, 1)) * 100
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Failure Rate</span>
                <span className="font-medium">
                  {status?.failureRate.toFixed(2) ?? '0.00'}%
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full transition-all ${
                    status && status.failureRate > 50 ? 'bg-red-600' : 'bg-green-600'
                  }`}
                  style={{ width: `${status?.failureRate ?? 0}%` }}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 pt-4">
              <div>
                <p className="text-sm text-muted-foreground">Success Count</p>
                <p className="text-2xl font-bold">{status?.successCount ?? 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Failure Count</p>
                <p className="text-2xl font-bold">{status?.failureCount ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
            <CardDescription>Last activity timestamps</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">Last Success</p>
                <p className="text-xs text-muted-foreground">
                  {status?.lastSuccessTime
                    ? new Date(status.lastSuccessTime).toLocaleString()
                    : 'N/A'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <div className="flex-1">
                <p className="text-sm font-medium">Last Failure</p>
                <p className="text-xs text-muted-foreground">
                  {status?.lastFailureTime
                    ? new Date(status.lastFailureTime).toLocaleString()
                    : 'N/A'}
                </p>
              </div>
            </div>
            {status?.nextAttemptTime && (
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-yellow-600" />
                <div className="flex-1">
                  <p className="text-sm font-medium">Next Retry Attempt</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(status.nextAttemptTime).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Configuration Info */}
      <Card>
        <CardHeader>
          <CardTitle>Circuit Breaker Configuration</CardTitle>
          <CardDescription>Current Opossum configuration</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <ConfigItem
              label="Error Threshold Percentage"
              value="50%"
              description="Open circuit when &gt; 50% failures"
            />
            <ConfigItem
              label="Reset Timeout"
              value="30s"
              description="Time before half-open state"
            />
            <ConfigItem
              label="Rolling Count Timeout"
              value="10s"
              description="Window for failure calculation"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  title,
  value,
  suffix,
  description,
  icon: Icon,
  color = 'text-primary',
}: {
  title: string;
  value: string;
  suffix?: string;
  description: string;
  icon?: React.ElementType;
  color?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && <Icon className={`h-4 w-4 ${color}`} />}
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold ${color}`}>
          {value}
          {suffix && <span className="text-sm ml-1">{suffix}</span>}
        </div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function ConfigItem({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-muted p-4">
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

function formatTimeUntil(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  if (diff <= 0) return 'Now';

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}
