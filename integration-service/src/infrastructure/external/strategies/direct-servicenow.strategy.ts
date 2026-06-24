import { Injectable } from '@nestjs/common';
import { ServiceNowConnector } from '../connectors/servicenow.connector';
import { IServiceNowRoutingStrategy, CreateIncidentResult, HealthCheckResult } from './servicenow-routing.strategy';

@Injectable()
export class DirectServiceNowStrategy implements IServiceNowRoutingStrategy {
  constructor(private readonly connector: ServiceNowConnector) {}

  async createIncident(payload: Record<string, any>): Promise<CreateIncidentResult> {
    const result = await this.connector.createIncident(payload);
    return {
      sysId: result?.sys_id,
      number: result?.number,
      status: 'CREATED',
    };
  }

  async updateIncident(incidentId: string, updates: Record<string, any>): Promise<void> {
    await this.connector.updateIncident(incidentId, updates);
  }

  async getIncidentStatus(incidentId: string): Promise<{ status: string; sysId?: string } | null> {
    const result = await this.connector.getIncidentStatus(incidentId);
    if (!result) return null;
    return { status: result.state, sysId: incidentId };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    return this.connector.healthCheck();
  }
}
