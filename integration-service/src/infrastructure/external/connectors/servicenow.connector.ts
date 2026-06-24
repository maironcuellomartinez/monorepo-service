// src/infrastructure/external/connectors/servicenow.connector.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { HealthCheckResult, IExternalConnector } from 'src/domain/interfaces/external-connector.interface';

@Injectable()
export class ServiceNowConnector implements Partial<IExternalConnector> {
    private readonly logger = new Logger(ServiceNowConnector.name);
    private readonly baseUrl: string;
    private readonly credentials: string;

    constructor(
        private readonly configService: ConfigService,
        private readonly httpService: HttpService,
    ) {
        this.baseUrl = this.configService.get<string>('servicenow.baseUrl') ?? '';
        const username = this.configService.get<string>('servicenow.username') ?? '';
        const password = this.configService.get<string>('servicenow.password') ?? '';
        this.credentials = Buffer.from(`${username}:${password}`).toString('base64');
    }

    async createIncident(payload: any): Promise<any> {
        try {
            const incidentData = this.transformToServiceNowFormat(payload);

            const response = await firstValueFrom(
                this.httpService.post(
                    `${this.baseUrl}/api/now/table/incident`,
                    incidentData,
                    {
                        headers: {
                            'Authorization': `Basic ${this.credentials}`,
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                        },
                        timeout: 10000,
                    }
                )
            );

            this.logger.log('ServiceNow incident created', {
                incidentNumber: response.data.result.number,
                sysId: response.data.result.sys_id,
                correlationId: payload.correlationId,
            });

            return response.data.result;

        } catch (error) {
            this.logger.error('Failed to create ServiceNow incident', {
                error: error.message,
                payload,
                baseUrl: this.baseUrl,
            });

            throw new Error(`ServiceNow integration failed: ${error.message}`);
        }
    }

    private transformToServiceNowFormat(payload: any): any {
        return {
            short_description: `Appointment ${payload.appointmentId} - ${payload.issueType}`,
            description: payload.description || 'No description provided',
            caller_id: payload.userId,
            urgency: this.mapPriority(payload.priority),
            category: 'Hardware',
            subcategory: payload.deviceType,
            assignment_group: 'IT Support',
            correlation_id: payload.correlationId,
        };
    }

    private mapPriority(priority: string): string {
        const priorityMap = {
            HIGH: '1',
            MEDIUM: '2',
            LOW: '3',
        };
        return priorityMap[priority] || '3';
    }

    async updateIncident(incidentId: string, updates: Record<string, any>): Promise<void> {
        try {
            await firstValueFrom(
                this.httpService.patch(
                    `${this.baseUrl}/api/now/table/incident/${incidentId}`,
                    updates,
                    {
                        headers: {
                            'Content-Type': 'application/json',
                            Authorization: `Basic ${this.credentials}`,
                        },
                        timeout: this.configService.get<number>('servicenow.timeout', 10000),
                    },
                ),
            );
        } catch (error: any) {
            this.logger.error(`Failed to update incident ${incidentId}: ${error.message}`);
            throw error;
        }
    }

    async getIncidentStatus(incidentId: string): Promise<{ state: string } | null> {
        try {
            const response = await firstValueFrom(
                this.httpService.get(
                    `${this.baseUrl}/api/now/table/incident/${incidentId}?sysparm_fields=state,sys_id,number`,
                    {
                        headers: {
                            Authorization: `Basic ${this.credentials}`,
                        },
                        timeout: this.configService.get<number>('servicenow.timeout', 10000),
                    },
                ),
            );
            return response.data?.result ?? null;
        } catch (error: any) {
            if (error?.response?.status === 404) return null;
            this.logger.error(`Failed to get incident status ${incidentId}: ${error.message}`);
            throw error;
        }
    }

    async healthCheck(): Promise<HealthCheckResult> {
        return {
            status: 'HEALTHY',
            latency: 0,
            timestamp: new Date().toISOString(),
        };
    }
}