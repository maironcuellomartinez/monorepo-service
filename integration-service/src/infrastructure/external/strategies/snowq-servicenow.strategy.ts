import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { IServiceNowRoutingStrategy, CreateIncidentResult, HealthCheckResult } from './servicenow-routing.strategy';

@Injectable()
export class SnowqServiceNowStrategy implements IServiceNowRoutingStrategy {
  private readonly logger = new Logger(SnowqServiceNowStrategy.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private get baseUrl(): string {
    return this.configService.get<string>('snowq.baseUrl', 'http://localhost:3090');
  }

  private get headers(): Record<string, string> {
    const token = this.configService.get<string>('abac.m2mToken', '');
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async createIncident(payload: Record<string, any>): Promise<CreateIncidentResult> {
    try {
      // Phase 1: immediate (sync)
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/snow-requests/immediate/incidents`, payload, {
          headers: this.headers,
          timeout: this.configService.get<number>('snowq.timeout', 10000),
        }),
      );
      return {
        sysId: response.data?.sys_id,
        number: response.data?.snowNumber,
        correlationId: response.data?.correlationId,
        status: 'IMMEDIATE',
      };
    } catch (immediateError) {
      this.logger.warn(`Immediate incident failed, falling back to async queue: ${immediateError.message}`);
      // Phase 2: async queue fallback
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/snow-requests/incidents`, payload, {
          headers: this.headers,
          timeout: this.configService.get<number>('snowq.timeout', 10000),
        }),
      );
      return {
        correlationId: response.data?.correlationId,
        status: 'QUEUED',
      };
    }
  }

  async updateIncident(incidentId: string, updates: Record<string, any>): Promise<void> {
    const baseUrl = this.configService.get<string>('SERVICENOW_BASE_URL', 'http://localhost:3010');
    await firstValueFrom(
      this.httpService.patch(
        `${baseUrl}/api/now/v2/incident/${incidentId}`,
        updates,
        { timeout: this.configService.get<number>('snowq.timeout', 10000) },
      ),
    );
  }

  async getIncidentStatus(correlationId: string): Promise<{ status: string; sysId?: string } | null> {
    try {
      const response = await firstValueFrom(
        this.httpService.get(`${this.baseUrl}/snow-requests/${correlationId}`, {
          headers: this.headers,
          timeout: 5000,
        }),
      );
      return { status: response.data?.status, sysId: response.data?.sysId };
    } catch {
      return null;
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    try {
      const start = Date.now();
      await firstValueFrom(this.httpService.get(`${this.baseUrl}/health`, { timeout: 3000 }));
      return { status: 'HEALTHY', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'UNHEALTHY', message: err.message };
    }
  }
}
