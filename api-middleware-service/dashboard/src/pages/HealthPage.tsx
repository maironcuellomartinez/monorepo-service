import { useEffect, useState } from 'react';
import {
  fetchHealth,
  fetchHealthStatus,
  HealthResponse,
  HealthStatusResponse,
  GatewayStatus,
  HttpBulkheadStats,
} from '../lib/api';
import { Badge } from '../components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Skeleton } from '../components/ui/skeleton';
import {
  Zap,
  Layers,
  Server,
  Activity,
  Clock,
  Timer,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  type LucideIcon,
} from 'lucide-react';

type ComponentStatus = 'ok' | 'warn' | 'critical';

const STATUS_CONFIG: Record<ComponentStatus, {
  label: string;
  icon: LucideIcon;
  badge: string;
  border: string;
  iconColor: string;
}> = {
  ok: {
    label: 'OK',
    icon: CheckCircle2,
    badge: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400',
    border: 'border-green-300 dark:border-green-700',
    iconColor: 'text-green-500 dark:text-green-400',
  },
  warn: {
    label: 'WARN',
    icon: AlertTriangle,
    badge: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-400',
    border: 'border-yellow-300 dark:border-yellow-700',
    iconColor: 'text-yellow-500 dark:text-yellow-400',
  },
  critical: {
    label: 'CRÍTICO',
    icon: XCircle,
    badge: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400',
    border: 'border-red-300 dark:border-red-700',
    iconColor: 'text-red-500 dark:text-red-400',
  },
};

function isGatewayStatus(v: GatewayStatus | { error: string } | undefined): v is GatewayStatus {
  return !!v && 'circuitBreaker' in v;
}

function isHttpBulkheadStats(v: HttpBulkheadStats | { error: string } | undefined): v is HttpBulkheadStats {
  return !!v && 'activeCalls' in v;
}

function cbStatus(state: string): ComponentStatus {
  const s = state.toUpperCase();
  if (s === 'CLOSED') return 'ok';
  if (s === 'HALF_OPEN') return 'warn';
  return 'critical';
}

function bulkheadStatus(queued: number): ComponentStatus {
  return queued > 0 ? 'warn' : 'ok';
}

interface ComponentCard {
  label: string;
  icon: LucideIcon;
  status: ComponentStatus;
  metrics: { label: string; value: string; highlight?: ComponentStatus }[];
}

function buildCards(status: HealthStatusResponse): ComponentCard[] {
  const cards: ComponentCard[] = [];

  if (isGatewayStatus(status.gateway)) {
    const cbState = status.gateway.circuitBreaker.state;
    const cbDescMap: Record<string, string> = {
      CLOSED:    'requests fluyendo',
      HALF_OPEN: 'recuperando',
      OPEN:      'bloqueando requests',
    };
    const cbNorm = cbState.toUpperCase();
    cards.push({
      label: 'Circuit Breaker',
      icon: Zap,
      status: cbStatus(cbState),
      metrics: [
        { label: 'Estado', value: cbNorm, highlight: cbStatus(cbState) },
        { label: 'Descripción', value: cbDescMap[cbNorm] ?? cbNorm },
      ],
    });
    cards.push({
      label: 'Gateway Bulkhead High',
      icon: Layers,
      status: bulkheadStatus(status.gateway.bulkhead.high.size),
      metrics: [
        { label: 'Activos', value: String(status.gateway.bulkhead.high.pending) },
        { label: 'En cola', value: String(status.gateway.bulkhead.high.size) },
      ],
    });
    cards.push({
      label: 'Gateway Bulkhead Low',
      icon: Layers,
      status: bulkheadStatus(status.gateway.bulkhead.low.size),
      metrics: [
        { label: 'Activos', value: String(status.gateway.bulkhead.low.pending) },
        { label: 'En cola', value: String(status.gateway.bulkhead.low.size) },
      ],
    });
  } else {
    cards.push({
      label: 'Gateway',
      icon: Zap,
      status: 'critical',
      metrics: [{ label: 'Error', value: (status.gateway as { error: string }).error ?? 'No disponible' }],
    });
  }

  if (isHttpBulkheadStats(status.bulkhead)) {
    cards.push({
      label: 'HTTP Bulkhead',
      icon: Server,
      status: bulkheadStatus(status.bulkhead.queuedCalls),
      metrics: [
        { label: 'Activos',      value: String(status.bulkhead.activeCalls) },
        { label: 'En cola',      value: String(status.bulkhead.queuedCalls) },
        { label: 'Concurrencia', value: String(status.bulkhead.maxConcurrentCalls) },
        { label: 'Max cola',     value: String(status.bulkhead.maxQueueSize) },
      ],
    });
  } else {
    cards.push({
      label: 'HTTP Bulkhead',
      icon: Server,
      status: 'critical',
      metrics: [{ label: 'Error', value: (status.bulkhead as { error: string }).error ?? 'No disponible' }],
    });
  }

  return cards;
}

export default function HealthPage() {
  const [health, setHealth]               = useState<HealthResponse | null>(null);
  const [status, setStatus]               = useState<HealthStatusResponse | null>(null);
  const [pingLoading, setPingLoading]     = useState(true);
  const [statusLoading, setStatusLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchHealth()
      .then((data) => { if (!cancelled) setHealth(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setPingLoading(false); });

    fetchHealthStatus()
      .then((data) => { if (!cancelled) setStatus(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setStatusLoading(false); });

    return () => { cancelled = true; };
  }, []);

  const uptimeSeconds = Math.floor(health?.uptime ?? 0);
  const days    = Math.floor(uptimeSeconds / 86400);
  const hours   = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);

  const cards = status ? buildCards(status) : [];
  const counts: Record<ComponentStatus, number> = { ok: 0, warn: 0, critical: 0 };
  cards.forEach((c) => counts[c.status]++);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Health</h2>

      {/* Ping cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Status</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {pingLoading
              ? <Skeleton className="h-6 w-16" />
              : <Badge className={health?.status === 'ok'
                  ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400'
                  : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
                }>
                  {health?.status ?? 'unknown'}
                </Badge>
            }
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
            {pingLoading
              ? <Skeleton className="h-8 w-24" />
              : <p className="text-2xl font-bold">{`${days}d ${hours}h ${minutes}m`}</p>
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Since</CardTitle>
              <Timer className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {pingLoading
              ? <Skeleton className="h-5 w-32" />
              : <p className="text-sm">{health?.timestamp ? new Date(health.timestamp).toLocaleString() : '-'}</p>
            }
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">Response</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent>
            {pingLoading
              ? <Skeleton className="h-6 w-10" />
              : <Badge className="bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-400">OK</Badge>
            }
          </CardContent>
        </Card>
      </div>

      {/* Component cards */}
      {statusLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="h-5 w-5 animate-spin" />
          Verificando componentes...
        </div>
      ) : cards.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted-foreground">
          No se pudo obtener el estado de los componentes
        </div>
      ) : (
        <>
          <div className="flex items-center gap-4">
            <SummaryPill status="ok"       count={counts.ok}       />
            <SummaryPill status="warn"     count={counts.warn}     />
            <SummaryPill status="critical" count={counts.critical} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cards.map((card) => <ComponentCard key={card.label} card={card} />)}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryPill({ status, count }: { status: ComponentStatus; count: number }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <div className="flex items-center gap-1.5 text-sm">
      <Icon className={`h-4 w-4 ${cfg.iconColor}`} />
      <span className="font-semibold">{count}</span>
      <span className="text-muted-foreground">{cfg.label}</span>
    </div>
  );
}

function ComponentCard({ card }: { card: ComponentCard }) {
  const cfg = STATUS_CONFIG[card.status];
  const StatusIcon = cfg.icon;
  const CardIcon = card.icon;

  return (
    <Card className={`border-2 ${cfg.border}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold">{card.label}</CardTitle>
          </div>
          <Badge className={`text-xs shrink-0 ${cfg.badge}`}>
            <StatusIcon className="h-3 w-3 mr-1" />
            {cfg.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          {card.metrics.map((m) => <Metric key={m.label} label={m.label} value={m.value} highlight={m.highlight} />)}
        </div>
      </CardContent>
    </Card>
  );
}

const METRIC_VALUE_COLOR: Record<ComponentStatus, string> = {
  ok:       'text-green-600 dark:text-green-400',
  warn:     'text-yellow-600 dark:text-yellow-400',
  critical: 'text-red-600 dark:text-red-400',
};

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: ComponentStatus }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? METRIC_VALUE_COLOR[highlight] : 'text-foreground'}`}>
        {value}
      </p>
    </div>
  );
}
