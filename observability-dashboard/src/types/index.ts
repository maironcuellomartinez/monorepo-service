// ── Log ───────────────────────────────────────────────────────────────────────

export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'verbose' | 'debug'

export interface LogEntry {
  id: string
  level: LogLevel
  message: string
  service: string
  timestamp: string
  receivedAt: string
  correlationId: string | null
  traceId: string | null
  spanId: string | null
  context: string | null
  stack: string | null
  meta: Record<string, unknown> | null
}

export interface LogsResponse {
  data: LogEntry[]
  total: number
}

export interface LogsQuery {
  service?: string
  level?: LogLevel
  correlationId?: string
  traceId?: string
  from?: string
  to?: string
  search?: string
  limit?: number
  offset?: number
}

// ── Trace ─────────────────────────────────────────────────────────────────────

export interface TraceSpan {
  id: string
  traceId: string
  spanId: string
  parentSpanId: string | null
  name: string
  serviceName: string
  correlationId: string | null
  kind: string | null
  statusCode: string | null
  startTime: string
  endTime: string
  durationMs: number | null
  attributes: Record<string, unknown> | null
  events: Record<string, unknown>[] | null
  receivedAt: string
}

export interface TracesResponse {
  data: TraceSpan[]
  total: number
}

export interface TracesQuery {
  traceId?: string
  correlationId?: string
  serviceName?: string
  name?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

// ── Metric ────────────────────────────────────────────────────────────────────

export interface MetricPoint {
  id: string
  name: string
  service: string
  value: number
  unit: string | null
  type: string
  labels: Record<string, string> | null
  correlationId: string | null
  timestamp: string
  receivedAt: string
}

export interface MetricsResponse {
  data: MetricPoint[]
  total: number
}

export interface MetricsQuery {
  name?: string
  service?: string
  correlationId?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

// ── Alert ─────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertStatus = 'active' | 'resolved' | 'acknowledged'

export interface AlertRule {
  id: string
  name: string
  service?: string
  level?: LogLevel
  metric?: string
  threshold: number
  windowMinutes: number
  severity: AlertSeverity
  enabled: boolean
  createdAt: string
}

export interface ActiveAlert {
  ruleId: string
  ruleName: string
  severity: AlertSeverity
  status: AlertStatus
  count: number
  detectedAt: string
  service?: string
}

// ── Health ────────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'degraded'
  db: 'ok' | 'error'
  uptime: number
}
