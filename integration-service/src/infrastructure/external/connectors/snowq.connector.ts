import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CorrelationIdService } from '../../logging/correlation-id.service';
import { TracingService } from '../../monitoring/tracing.service';

export interface SnowqQueueResult {
  correlationId: string;
  internalNumber: string;
  deduplicated: boolean;
}

export interface SnowqImmediateResult {
  sys_id: string;
  snowNumber: string;
}

export interface SnowqRequestStatus {
  correlationId: string;
  internalNumber: string;
  status: 'IN_PROGRESS' | 'QUEUED' | 'DELIVERED' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  sysId?: string;
  snowNumber?: string;
  lastError?: string;
}

@Injectable()
export class SnowqConnector {
  private readonly logger = new Logger(SnowqConnector.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly correlationService: CorrelationIdService,
    private readonly tracing: TracingService,
  ) {}

  private get baseUrl(): string {
    return this.configService.get<string>('snowq.baseUrl', 'http://localhost:3090');
  }

  private get headers(): Record<string, string> {
    const m2mToken = this.configService.get<string>('abac.m2mToken', '');
    const cid = this.correlationService.getCorrelationId();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${m2mToken}`,
      ...(cid ? { 'x-correlation-id': cid } : {}),
    };
  }

  async queueIncident(payload: Record<string, any>): Promise<SnowqQueueResult> {
    return this.tracing.run('integration.connector.snowq.queueIncident', { kind: 'client' }, () => this._queueIncident(payload));
  }

  private async _queueIncident(payload: Record<string, any>): Promise<SnowqQueueResult> {
    const response = await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/snow-requests/incidents`, payload, {
        headers: this.headers,
        timeout: this.configService.get<number>('snowq.timeout', 10000),
      }),
    );
    return response.data;
  }

  async queueImmediateIncident(payload: Record<string, any>): Promise<SnowqImmediateResult> {
    return this.tracing.run('integration.connector.snowq.queueImmediateIncident', { kind: 'client' }, () => this._queueImmediateIncident(payload));
  }

  private async _queueImmediateIncident(payload: Record<string, any>): Promise<SnowqImmediateResult> {
    const response = await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/snow-requests/immediate/incidents`, payload, {
        headers: this.headers,
        timeout: this.configService.get<number>('snowq.timeout', 10000),
      }),
    );
    return response.data;
  }

  async queueRequest(payload: Record<string, any>): Promise<SnowqQueueResult> {
    return this.tracing.run('integration.connector.snowq.queueRequest', { kind: 'client' }, () => this._queueRequest(payload));
  }

  private async _queueRequest(payload: Record<string, any>): Promise<SnowqQueueResult> {
    const response = await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/snow-requests/service-catalog`, payload, {
        headers: this.headers,
        timeout: this.configService.get<number>('snowq.timeout', 10000),
      }),
    );
    return response.data;
  }

  async queueImmediateRequest(payload: Record<string, any>): Promise<SnowqImmediateResult> {
    return this.tracing.run('integration.connector.snowq.queueImmediateRequest', { kind: 'client' }, () => this._queueImmediateRequest(payload));
  }

  private async _queueImmediateRequest(payload: Record<string, any>): Promise<SnowqImmediateResult> {
    const response = await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/snow-requests/immediate/service-catalog`, payload, {
        headers: this.headers,
        timeout: this.configService.get<number>('snowq.timeout', 10000),
      }),
    );
    return response.data;
  }

  async getRequestStatus(correlationId: string): Promise<SnowqRequestStatus | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/snow-requests/${correlationId}`, {
          headers: this.headers,
          timeout: 5000,
        }),
      );
      return response.data;
    } catch (error: any) {
      if (error?.response?.status === 404) return null;
      throw error;
    }
  }

  async getDlq(): Promise<SnowqRequestStatus[]> {
    const response = await firstValueFrom(
      this.httpService.get(`${this.baseUrl}/snow-requests/failed`, {
        headers: this.headers,
        timeout: 5000,
      }),
    );
    return response.data;
  }

  async retryFailed(correlationId: string): Promise<void> {
    return this.tracing.run('integration.connector.snowq.retryFailed', { kind: 'client', attributes: { 'sn.correlationId': correlationId } }, () => this._retryFailed(correlationId));
  }

  private async _retryFailed(correlationId: string): Promise<void> {
    await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/snow-requests/failed/${correlationId}/retry`, {}, {
        headers: this.headers,
        timeout: 5000,
      }),
    );
  }

  async retryAllFailed(): Promise<{ retried: number }> {
    return this.tracing.run('integration.connector.snowq.retryAllFailed', { kind: 'client' }, () => this._retryAllFailed());
  }

  private async _retryAllFailed(): Promise<{ retried: number }> {
    const response = await firstValueFrom(
      this.httpService.post(`${this.baseUrl}/snow-requests/failed/retry-all`, {}, {
        headers: this.headers,
        timeout: 5000,
      }),
    );
    return response.data;
  }

  async healthCheck(): Promise<{ status: 'HEALTHY' | 'UNHEALTHY'; latencyMs?: number }> {
    try {
      const start = Date.now();
      await firstValueFrom(this.httpService.get(`${this.baseUrl}/health`, { timeout: 3000 }));
      return { status: 'HEALTHY', latencyMs: Date.now() - start };
    } catch (err: any) {
      return { status: 'UNHEALTHY' };
    }
  }
}
