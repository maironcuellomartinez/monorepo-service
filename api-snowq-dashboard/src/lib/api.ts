import { apiClient } from '@/lib/api-client';
import type {
  SnowRequest,
  QueueStats,
  CircuitBreakerStatus,
  MonitoringResult,
  ThrukAlert,
  HealthStatus,
  DlqFilter,
  DlqStats,
} from '@/types';

export const snowQApi = {
  // Health
  async getHealth(): Promise<HealthStatus> {
    try {
      const { data } = await apiClient.get('/health/status');
      const overallStatus = data.status === 'alive' ? 'ok' : data.status === 'degraded' ? 'degraded' : 'error';
      return {
        status: overallStatus,
        uptime: data.uptime || 0,
        timestamp: data.ts || new Date().toISOString(),
        checks: {
          database: data.checks?.database,
          servicenow: data.checks?.servicenow,
          circuitBreaker: data.checks?.circuitBreaker,
          queue: data.checks?.queue,
        },
      };
    } catch {
      // fallback a liveness si el token falla o el endpoint no existe
      const { data } = await apiClient.get('/health/live');
      return {
        status: data.status === 'alive' ? 'ok' : 'error',
        uptime: data.uptime || 0,
        timestamp: data.ts || new Date().toISOString(),
        checks: {},
      };
    }
  },

  // Queue Stats - construidos desde los endpoints reales
  async getQueueStats(): Promise<QueueStats> {
    try {
      const [failed, all] = await Promise.all([
        apiClient.get('/snow-requests/failed').catch(() => ({ data: [] })),
        apiClient.get('/snow-requests/all').catch(() => ({ data: [] })),
      ]);

      // Contar por estado y prioridad
      const byStatus: Record<string, number> = {};
      const byPriority: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      const byType: Record<string, number> = {};

      all.data.forEach((r: any) => {
        byStatus[r.status] = (byStatus[r.status] || 0) + 1;
        byPriority[r.priority] = (byPriority[r.priority] || 0) + 1;
        byType[r.type] = (byType[r.type] || 0) + 1;
      });

      return {
        totalQueued: byStatus['QUEUED'] || 0,
        totalInProgress: byStatus['IN_PROGRESS'] || 0,
        totalDelivered: byStatus['DELIVERED'] || 0,
        totalFailed: byStatus['FAILED'] || 0,
        totalCancelled: byStatus['CANCELED'] || 0,
        byPriority: byPriority as any,
        byType,
        avgProcessingTimeMs: 0,
        dlqSize: Array.isArray(failed.data) ? failed.data.length : 0,
      };
    } catch {
      return {
        totalQueued: 0,
        totalInProgress: 0,
        totalDelivered: 0,
        totalFailed: 0,
        totalCancelled: 0,
        byPriority: { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 },
        byType: {},
        avgProcessingTimeMs: 0,
        dlqSize: 0,
      };
    }
  },

  async getAllRequests(): Promise<SnowRequest[]> {
    const { data } = await apiClient.get('/snow-requests/all');
    return Array.isArray(data) ? data : [];
  },

  async getDeliveredRequests(): Promise<SnowRequest[]> {
    const { data } = await apiClient.get('/snow-requests/delivered');
    return Array.isArray(data) ? data : [];
  },

  async getFailedRequests(): Promise<SnowRequest[]> {
    const { data } = await apiClient.get('/snow-requests/failed');
    return Array.isArray(data) ? data : [];
  },

  async getQueuedRequests(): Promise<SnowRequest[]> {
    const data = await this.getAllRequests();
    return data.filter((r) => r.status === 'QUEUED' || r.status === 'IN_PROGRESS');
  },

  async getRequests(): Promise<SnowRequest[]> {
    return this.getAllRequests();
  },

  async getRequestByCorrelationId(correlationId: string): Promise<SnowRequest | null> {
    try {
      const { data } = await apiClient.get(`/snow-requests/${correlationId}`);
      return data;
    } catch {
      return null;
    }
  },

  async retryRequest(correlationId: string): Promise<void> {
    await apiClient.post(`/snow-requests/failed/${correlationId}/retry`);
  },

  async retryAllFailed(): Promise<number> {
    const { data } = await apiClient.post('/snow-requests/failed/retry-all');
    return data.requeued || 0;
  },

  async retryFiltered(filter: DlqFilter): Promise<number> {
    const { data } = await apiClient.post('/snow-requests/failed/retry', filter);
    return data.requeued || 0;
  },

  async discardFailed(correlationId: string): Promise<void> {
    await apiClient.delete(`/snow-requests/failed/${correlationId}`);
  },

  async discardFiltered(filter: DlqFilter): Promise<number> {
    const { data } = await apiClient.delete('/snow-requests/failed', { data: filter });
    return data.discarded || 0;
  },

  async getDlqStats(): Promise<DlqStats> {
    const { data } = await apiClient.get('/snow-requests/dlq/stats');
    return data;
  },

  // Circuit Breaker - consulta al backend real
  async getCircuitBreakerStatus(): Promise<CircuitBreakerStatus> {
    try {
      const { data } = await apiClient.get('/resilience/circuit-breaker/status');
      return data;
    } catch (error) {
      console.warn('Circuit Breaker endpoint no disponible, usando datos mock');
      return {
        state: 'closed',
        failureRate: 0,
        failureCount: 0,
        successCount: 0,
        totalRequests: 0,
        totalFailures: 0,
        totalSuccesses: 0,
      };
    }
  },

  async resetCircuitBreaker(): Promise<void> {
    try {
      await apiClient.post('/resilience/circuit-breaker/reset');
    } catch (error: any) {
      if (error?.response?.status === 404) {
        console.warn('Endpoint de reset no implementado en el backend');
        throw new Error('El backend no tiene implementado el endpoint de reset');
      }
      throw error;
    }
  },

  // Monitoring (Nagios/Thruk)
  async sendAlert(alert: ThrukAlert): Promise<MonitoringResult> {
    const { data } = await apiClient.post('/monitoring/alerts', alert);
    return data;
  },

  async cancelAlertByFingerprint(fingerprint: string): Promise<MonitoringResult> {
    const { data } = await apiClient.post(`/monitoring/cancel/${encodeURIComponent(fingerprint)}`);
    return data;
  },

  async getActiveAlerts(): Promise<SnowRequest[]> {
    try {
      const data = await this.getAllRequests();
      return data.filter(
        (r) =>
          r.source === 'nagios-thruk' &&
          (r.status === 'QUEUED' || r.status === 'IN_PROGRESS' || r.status === 'DELIVERED'),
      );
    } catch {
      return [];
    }
  },
};
