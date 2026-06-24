export interface HealthCheckResult {
  status: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  message?: string;
  latencyMs?: number;
}

export interface CreateIncidentResult {
  correlationId?: string;
  sysId?: string;
  number?: string;
  status: 'QUEUED' | 'CREATED' | 'IMMEDIATE';
}

export interface IServiceNowRoutingStrategy {
  createIncident(payload: Record<string, any>): Promise<CreateIncidentResult>;
  updateIncident(incidentId: string, updates: Record<string, any>): Promise<void>;
  getIncidentStatus(incidentId: string): Promise<{ status: string; sysId?: string } | null>;
  healthCheck(): Promise<HealthCheckResult>;
}

export const SERVICENOW_STRATEGY = 'SERVICENOW_STRATEGY';
