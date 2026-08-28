// infrastructure/external/inventory/inventory-http.adapter.ts
import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { CorrelationIdService } from '@app/observability';
import {
    IExternalInventoryService,
    InventoryDeviceData,
} from '../../../core/ports/outgoing/external/inventory-service.port';

interface ApiAssignedUser {
    userId: string;
    nombre: string;
}

interface ApiDevice {
    serial_number: string;
    model?: string;
    brand?: string;
    device_type?: string;
    assigned_user?: ApiAssignedUser | null;
}

/**
 * Adaptador que delega las consultas de inventario al API Gateway.
 * El API Gateway actúa como único punto de salida (egress) hacia el
 * sistema de inventario externo a través de /outbound/inventory/*.
 *
 * Variable de entorno requerida:
 *   API_GATEWAY_URL   Base URL del API Gateway (ej: http://localhost:3000)
 */
@Injectable()
export class InventoryHttpAdapter implements IExternalInventoryService {
    private readonly logger = new Logger(InventoryHttpAdapter.name);
    private readonly baseUrl: string;
    private readonly m2mToken: string;

    constructor(
        private readonly http: HttpService,
        private readonly config: ConfigService,
        private readonly correlation: CorrelationIdService,
    ) {
        const gatewayUrl = this.config.get<string>('API_GATEWAY_URL', 'http://localhost:3000');
        this.baseUrl = `${gatewayUrl}/outbound/inventory`;
        this.m2mToken = this.config.get<string>('ABAC_M2M_TOKEN', '');
    }

    private get headers(): Record<string, string> {
        const cid = this.correlation.getCorrelationId();
        return {
            'Authorization': `Bearer ${this.m2mToken}`,
            ...(cid ? { 'x-correlation-id': cid } : {}),
        };
    }

    async getBySerial(serialNumber: string): Promise<InventoryDeviceData | null> {
        try {
            const { data } = await firstValueFrom(
                this.http.get<ApiDevice>(`${this.baseUrl}/devices/${encodeURIComponent(serialNumber)}`, { headers: this.headers }),
            );
            return this.mapDevice(data);
        } catch (err: any) {
            if (err?.response?.status === 404) return null;
            this.logger.error(`Inventory getBySerial(${serialNumber}): ${err?.message}`);
            throw err;
        }
    }

    async getDevicesByUser(userId: string): Promise<InventoryDeviceData[]> {
        try {
            const { data } = await firstValueFrom(
                this.http.get<ApiDevice[]>(`${this.baseUrl}/users/${encodeURIComponent(userId)}`, { headers: this.headers }),
            );
            return (Array.isArray(data) ? data : []).map(d => this.mapDevice(d));
        } catch (err: any) {
            this.logger.error(`Inventory getDevicesByUser(${userId}): ${err?.message}`);
            throw err;
        }
    }

    private mapDevice(raw: ApiDevice): InventoryDeviceData {
        return {
            serialNumber: raw.serial_number,
            model: raw.model ?? null,
            brand: raw.brand ?? null,
            deviceType: raw.device_type ?? null,
            assignedUser: raw.assigned_user
                ? { userId: raw.assigned_user.userId, nombre: raw.assigned_user.nombre }
                : null,
        };
    }
}
