// Request Types
export type RequestType = 'incident' | 'problem' | 'change_request' | 'sc_req_item' | string;
export type RequestPriority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type RequestStatus = 'QUEUED' | 'IN_PROGRESS' | 'DELIVERED' | 'FAILED' | 'CANCELLED' | 'EXPIRED' | 'DISCARDED';
export type RequestSource = 'monolith' | 'nagios-thruk' | 'api' | string;

export interface SnowRequest {
  id: string;
  correlationId: string;
  internalNumber: string;
  type: RequestType;
  priority: RequestPriority;
  status: RequestStatus;
  source: RequestSource;
  payload: Record<string, unknown>;
  fingerprint?: string;
  sysId?: string;
  snowNumber?: string;
  retryCount: number;
  maxRetries: number;
  lastError?: string;
  nextRetryAt?: string;
  expiresAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Monitoring Types
export type MonitoringAction = 
  | 'QUEUED' 
  | 'DEDUPLICATED' 
  | 'CANCELLED' 
  | 'TOO_LATE' 
  | 'RESOLVED_IN_SN' 
  | 'IGNORED';

export interface MonitoringResult {
  action: MonitoringAction;
  correlationId?: string;
  internalNumber?: string;
  reason: string;
  existingStatus?: RequestStatus;
  sysId?: string;
  snowNumber?: string;
}

export type NagiosNotificationType = 
  | 'PROBLEM' 
  | 'RECOVERY' 
  | 'ACKNOWLEDGEMENT' 
  | 'FLAPPINGSTART' 
  | 'FLAPPINGSTOP' 
  | 'DOWNTIMESTART' 
  | 'DOWNTIMEEND';

export type NagiosStateType = 'SOFT' | 'HARD';

export interface ThrukAlert {
  host: string;
  service?: string;
  state: string;
  output: string;
  notificationType: NagiosNotificationType;
  stateType: NagiosStateType;
  checkAttempt: number;
  maxCheckAttempts: number;
  ttlSeconds?: number;
  timestamp: string;
}

// Circuit Breaker Types
export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerStatus {
  state: CircuitState;
  failureRate: number;
  failureCount: number;
  successCount: number;
  lastFailureTime?: string;
  lastSuccessTime?: string;
  nextAttemptTime?: string;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
}

// Queue Stats Types
export interface QueueStats {
  totalQueued: number;
  totalInProgress: number;
  totalDelivered: number;
  totalFailed: number;
  totalCancelled: number;
  byPriority: Record<RequestPriority, number>;
  byType: Record<RequestType, number>;
  avgProcessingTimeMs: number;
  dlqSize: number;
}

// Metrics Types
export interface MetricsSummary {
  requestsTotal: number;
  requestsSuccess: number;
  requestsFailed: number;
  avgDurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  circuitBreakerTrips: number;
  retriesTotal: number;
  deduplicationsTotal: number;
}

export interface DurationHistogram {
  buckets: {
    le: number;
    count: number;
  }[];
  sum: number;
  count: number;
}

export interface TimeSeriesPoint {
  timestamp: string;
  value: number;
}

// Health Check Types
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  uptime: number;
  timestamp: string;
  checks: {
    database?: { status: 'up' | 'down'; responseTimeMs?: number };
    servicenow?: { status: 'up' | 'down'; responseTimeMs?: number };
    circuitBreaker?: { status: 'up' | 'down'; state: CircuitState };
    queue?: { status: 'up' | 'down'; pendingCount: number };
  };
}

// DLQ Types
export interface DlqFilter {
  type?: string;
  source?: string;
  since?: string;
  until?: string;
}

export interface DlqStats {
  total: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  byErrorPattern: Array<{ error: string; count: number }>;
  oldest: string | null;
  newest: string | null;
}

// Pagination Types
export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Filter Types
export interface RequestsFilter {
  status?: RequestStatus;
  priority?: RequestPriority;
  type?: RequestType;
  source?: RequestSource;
  correlationId?: string;
  internalNumber?: string;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}
