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
import { snowQApi } from '@/lib/api';
import type { SnowRequest, ThrukAlert } from '@/types';
import { Bell, CheckCircle2, Clock, RefreshCcw } from 'lucide-react';

export default function MonitoringAlertsPage() {
  const [activeAlerts, setActiveAlerts] = useState<SnowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [alertForm, setAlertForm] = useState<Omit<ThrukAlert, 'timestamp'>>({
    host: '',
    service: '',
    state: 'CRITICAL',
    output: '',
    notificationType: 'PROBLEM',
    stateType: 'HARD',
    checkAttempt: 1,
    maxCheckAttempts: 3,
    ttlSeconds: 300,
  });
  const [sending, setSending] = useState(false);

  const loadAlerts = async () => {
    try {
      const data = await snowQApi.getActiveAlerts();
      setActiveAlerts(data);
    } catch (error) {
      console.error('Failed to load active alerts:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
    const interval = setInterval(loadAlerts, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleSendAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    try {
      const alert: ThrukAlert = {
        ...alertForm,
        timestamp: new Date().toISOString(),
      };
      const result = await snowQApi.sendAlert(alert);
      console.log('Alert sent:', result);
      setAlertForm({
        host: '',
        service: '',
        state: 'CRITICAL',
        output: '',
        notificationType: 'PROBLEM',
        stateType: 'HARD',
        checkAttempt: 1,
        maxCheckAttempts: 3,
        ttlSeconds: 300,
      });
      await loadAlerts();
    } catch (error) {
      console.error('Failed to send alert:', error);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Monitoring Alerts</h1>
          <p className="text-muted-foreground">
            Nagios/Thruk integration and alert management
          </p>
        </div>
        <Button onClick={loadAlerts} variant="outline" size="icon">
          <RefreshCcw className="h-5 w-5" />
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Active Alerts */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Active Alerts
            </CardTitle>
            <CardDescription>
              Currently active monitoring alerts from Nagios/Thruk
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-48 items-center justify-center text-muted-foreground">
                Loading...
              </div>
            ) : activeAlerts.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center text-muted-foreground">
                <CheckCircle2 className="mb-2 h-12 w-12 text-green-600" />
                <p>No active alerts</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Internal #</TableHead>
                    <TableHead>Host</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeAlerts.map((alert) => {
                    const host = alert.payload.host as string || 'Unknown';
                    const service = alert.payload.service as string || 'HOST';
                    const state = alert.payload.state as string || 'UNKNOWN';
                    return (
                      <TableRow key={alert.id}>
                        <TableCell className="font-medium">
                          {alert.internalNumber}
                        </TableCell>
                        <TableCell className="font-medium">{host}</TableCell>
                        <TableCell>{service}</TableCell>
                        <TableCell>
                          <StateBadge state={state} />
                        </TableCell>
                        <TableCell>
                          <Badge variant={getPriorityVariant(alert.priority)}>
                            {alert.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={alert.status} />
                        </TableCell>
                        <TableCell>
                          {new Date(alert.createdAt).toLocaleString()}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Send Test Alert */}
        <Card>
          <CardHeader>
            <CardTitle>Send Test Alert</CardTitle>
            <CardDescription>
              Simulate a Nagios/Thruk alert for testing
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSendAlert} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Host</label>
                  <input
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="web-server-01"
                    value={alertForm.host}
                    onChange={(e) =>
                      setAlertForm({ ...alertForm, host: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Service</label>
                  <input
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="HTTP (optional)"
                    value={alertForm.service || ''}
                    onChange={(e) =>
                      setAlertForm({ ...alertForm, service: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">State</label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={alertForm.state}
                  onChange={(e) =>
                    setAlertForm({ ...alertForm, state: e.target.value })
                  }
                >
                  <option value="CRITICAL">CRITICAL</option>
                  <option value="WARNING">WARNING</option>
                  <option value="DOWN">DOWN</option>
                  <option value="UNREACHABLE">UNREACHABLE</option>
                  <option value="UNKNOWN">UNKNOWN</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Output</label>
                <textarea
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  placeholder="Connection timeout after 30s"
                  value={alertForm.output}
                  onChange={(e) =>
                    setAlertForm({ ...alertForm, output: e.target.value })
                  }
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Notification Type</label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={alertForm.notificationType}
                    onChange={(e) =>
                      setAlertForm({
                        ...alertForm,
                        notificationType: e.target.value as ThrukAlert['notificationType'],
                      })
                    }
                  >
                    <option value="PROBLEM">PROBLEM</option>
                    <option value="RECOVERY">RECOVERY</option>
                    <option value="ACKNOWLEDGEMENT">ACKNOWLEDGEMENT</option>
                    <option value="FLAPPINGSTART">FLAPPINGSTART</option>
                    <option value="FLAPPINGSTOP">FLAPPINGSTOP</option>
                    <option value="DOWNTIMESTART">DOWNTIMESTART</option>
                    <option value="DOWNTIMEEND">DOWNTIMEEND</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">TTL (seconds)</label>
                  <input
                    type="number"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={alertForm.ttlSeconds || 300}
                    onChange={(e) =>
                      setAlertForm({
                        ...alertForm,
                        ttlSeconds: parseInt(e.target.value),
                      })
                    }
                  />
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={sending}>
                <Bell className="mr-2 h-4 w-4" />
                {sending ? 'Sending...' : 'Send Test Alert'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Alert Statistics */}
        <Card>
          <CardHeader>
            <CardTitle>Alert Statistics</CardTitle>
            <CardDescription>Last 24 hours</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Active Alerts</span>
              <span className="text-2xl font-bold">{activeAlerts.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Queued</span>
              <span className="text-2xl font-bold">
                {activeAlerts.filter((a) => a.status === 'QUEUED').length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">In Progress</span>
              <span className="text-2xl font-bold">
                {activeAlerts.filter((a) => a.status === 'IN_PROGRESS').length}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Deduplicated</span>
              <span className="text-2xl font-bold">
                {activeAlerts.filter((a) => a.fingerprint).length}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Information */}
      <Card>
        <CardHeader>
          <CardTitle>How It Works</CardTitle>
          <CardDescription>Nagios/Thruk integration flow</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border bg-muted p-4">
              <div className="flex items-center gap-2">
                <Bell className="h-5 w-5 text-blue-600" />
                <h3 className="font-semibold">1. Alert Received</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Thruk sends PROBLEM notifications to /monitoring/alerts endpoint
              </p>
            </div>
            <div className="rounded-lg border bg-muted p-4">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-yellow-600" />
                <h3 className="font-semibold">2. Queued & Deduplicated</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Alerts are fingerprinted and deduplicated to prevent duplicates
              </p>
            </div>
            <div className="rounded-lg border bg-muted p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <h3 className="font-semibold">3. Processed</h3>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Alerts are sent to ServiceNow based on priority and batch size
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StateBadge({ state }: { state: string }) {
  const getStateColor = (s: string) => {
    switch (s.toUpperCase()) {
      case 'CRITICAL':
      case 'DOWN':
        return 'destructive';
      case 'WARNING':
        return 'warning';
      case 'UNKNOWN':
      case 'UNREACHABLE':
        return 'secondary';
      default:
        return 'default';
    }
  };

  return <Badge variant={getStateColor(state)}>{state}</Badge>;
}

function StatusBadge({ status }: { status: string }) {
  const variants = {
    QUEUED: 'secondary',
    IN_PROGRESS: 'default',
    DELIVERED: 'success',
    FAILED: 'destructive',
    CANCELLED: 'outline',
  } as Record<string, 'secondary' | 'default' | 'success' | 'destructive' | 'outline'>;

  return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
}

function getPriorityVariant(priority: string) {
  const variants = {
    CRITICAL: 'destructive',
    HIGH: 'warning',
    MEDIUM: 'default',
    LOW: 'secondary',
  } as Record<string, 'destructive' | 'warning' | 'default' | 'secondary'>;

  return variants[priority as keyof typeof variants] || 'default';
}
