import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { snowQApi } from '@/lib/api';
import type { QueueStats, CircuitBreakerStatus } from '@/types';
import {
  Ticket,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Activity,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function DashboardOverviewPage() {
  const [queueStats, setQueueStats] = useState<QueueStats | null>(null);
  const [circuitBreaker, setCircuitBreaker] = useState<CircuitBreakerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeSeriesData, setTimeSeriesData] = useState<any[]>([]);

  const loadData = async () => {
    try {
      const [queueStatsData, circuitBreakerData, failedRequests] = await Promise.all([
        snowQApi.getQueueStats(),
        snowQApi.getCircuitBreakerStatus(),
        snowQApi.getFailedRequests(),
      ]);
      setQueueStats(queueStatsData);
      setCircuitBreaker(circuitBreakerData);

      // Usar failed requests para las métricas
      const metricsData = {
        requestsTotal: failedRequests.length,
        requestsSuccess: 0,
        requestsFailed: failedRequests.length,
        avgDurationMs: 0,
        p95DurationMs: 0,
        p99DurationMs: 0,
        circuitBreakerTrips: 0,
        retriesTotal: 0,
        deduplicationsTotal: 0,
      };

      // Generate mock time series data
      const mockData = generateMockTimeSeries();
      setTimeSeriesData(mockData);

      return metricsData;
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      console.log('Verificá la configuración en Configuración > URL del servicio');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    loadData().then(setMetrics);

    const handleRefresh = () => loadData().then(setMetrics);
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, []);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <Activity className="mx-auto h-12 w-12 animate-spin text-primary" />
          <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of api-snowq-service performance and queue status
        </p>
      </div>

      {/* Metrics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Requests"
          value={metrics?.requestsTotal.toLocaleString() ?? '0'}
          description="Last 24 hours"
          icon={Ticket}
          trend="+12.5%"
          trendUp={true}
        />
        <MetricCard
          title="Success Rate"
          value={metrics ? `${((metrics.requestsSuccess / metrics.requestsTotal) * 100).toFixed(1)}%` : '0%'}
          description="Successful deliveries"
          icon={CheckCircle2}
          trend="+2.1%"
          trendUp={true}
        />
        <MetricCard
          title="Avg Duration"
          value={metrics?.avgDurationMs.toLocaleString() ?? '0'}
          description="Milliseconds"
          icon={Clock}
          trend="-8.3%"
          trendUp={true}
        />
        <MetricCard
          title="Failed"
          value={metrics?.requestsFailed.toLocaleString() ?? '0'}
          description="Requires attention"
          icon={XCircle}
          trend="+1.2%"
          trendUp={false}
        />
      </div>

      {/* Queue Stats & Circuit Breaker */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Request Volume (24h)
            </CardTitle>
            <CardDescription>Requests processed over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeriesData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="time" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="requests" stroke="hsl(var(--primary))" strokeWidth={2} />
                  <Line type="monotone" dataKey="success" stroke="hsl(var(--chart-2))" strokeWidth={2} />
                  <Line type="monotone" dataKey="failed" stroke="hsl(var(--destructive))" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Circuit Breaker
            </CardTitle>
            <CardDescription>Current state and health</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">State</span>
              <Badge
                variant={
                  circuitBreaker?.state === 'closed'
                    ? 'success'
                    : circuitBreaker?.state === 'open'
                    ? 'destructive'
                    : 'warning'
                }
              >
                {circuitBreaker?.state ?? 'unknown'}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Failure Rate</span>
              <span className="font-mono text-sm">
                {circuitBreaker?.failureRate.toFixed(2) ?? '0.00'}%
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Requests</span>
              <span className="font-mono text-sm">
                {circuitBreaker?.totalRequests.toLocaleString() ?? '0'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Total Failures</span>
              <span className="font-mono text-sm">
                {circuitBreaker?.totalFailures.toLocaleString() ?? '0'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Queue by Priority */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <QueuePriorityCard
          priority="CRITICAL"
          count={queueStats?.byPriority.CRITICAL ?? 0}
          color="bg-red-600"
        />
        <QueuePriorityCard
          priority="HIGH"
          count={queueStats?.byPriority.HIGH ?? 0}
          color="bg-orange-500"
        />
        <QueuePriorityCard
          priority="MEDIUM"
          count={queueStats?.byPriority.MEDIUM ?? 0}
          color="bg-yellow-500"
        />
        <QueuePriorityCard
          priority="LOW"
          count={queueStats?.byPriority.LOW ?? 0}
          color="bg-blue-500"
        />
      </div>

      {/* Additional Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Queued"
          value={queueStats?.totalQueued.toLocaleString() ?? '0'}
          description="Waiting to be processed"
          icon={Clock}
          color="text-blue-600"
        />
        <StatCard
          title="In Progress"
          value={queueStats?.totalInProgress.toLocaleString() ?? '0'}
          description="Currently processing"
          icon={Activity}
          color="text-yellow-600"
        />
        <StatCard
          title="DLQ Size"
          value={queueStats?.dlqSize.toLocaleString() ?? '0'}
          description="Dead letter queue"
          icon={AlertTriangle}
          color="text-red-600"
        />
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ElementType;
  trend: string;
  trendUp: boolean;
}

function MetricCard({ title, value, description, icon: Icon, trend, trendUp }: MetricCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center text-xs text-muted-foreground">
          <TrendingUp className={`mr-1 h-3 w-3 ${trendUp ? 'text-green-600' : 'text-red-600'}`} />
          {trend} {description}
        </div>
      </CardContent>
    </Card>
  );
}

interface QueuePriorityCardProps {
  priority: string;
  count: number;
  color: string;
}

function QueuePriorityCard({ priority, count, color }: QueuePriorityCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{priority}</CardTitle>
        <div className={`h-3 w-3 rounded-full ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{count.toLocaleString()}</div>
        <p className="text-xs text-muted-foreground">requests queued</p>
      </CardContent>
    </Card>
  );
}

interface StatCardProps {
  title: string;
  value: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

function StatCard({ title, value, description, icon: Icon, color }: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  );
}

function generateMockTimeSeries() {
  const now = new Date();
  const data = [];
  for (let i = 23; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60 * 60 * 1000);
    data.push({
      time: time.getHours().toString().padStart(2, '0') + ':00',
      requests: Math.floor(Math.random() * 100) + 50,
      success: Math.floor(Math.random() * 90) + 45,
      failed: Math.floor(Math.random() * 10) + 1,
    });
  }
  return data;
}
