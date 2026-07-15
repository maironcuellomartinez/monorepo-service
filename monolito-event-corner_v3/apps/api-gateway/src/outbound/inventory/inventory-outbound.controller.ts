// api-gateway/outbound/inventory/inventory-outbound.controller.ts
import {
  Controller,
  Get,
  Param,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { InternalOnly } from '../../auth/decorators/internal.decorator';

/**
 * Proxy de salida hacia el inventario externo (vía integration-service).
 *
 * Transforma la respuesta de integration-service al formato que espera
 * el InventoryHttpAdapter del monolith:
 *   ApiDevice  → { serial_number, model, brand, device_type, assigned_user }
 *   ApiUser    → { userId, nombre, dispositivosAsignados }
 *
 * Env: EXTERNAL_INVENTORY_URL = http://localhost:3008/api/v1/minerva
 *
 * El integration-service envuelve respuestas en { success, data, ... } vía
 * TransformResponseInterceptor. Este controller desenvuelve esa capa antes
 * de construir la respuesta para el monolith.
 */
@InternalOnly()
@Controller('outbound/inventory')
export class InventoryOutboundController {
  private readonly logger = new Logger(InventoryOutboundController.name);
  private readonly inventoryUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.inventoryUrl = this.config.get<string>(
      'EXTERNAL_INVENTORY_URL',
      'http://localhost:3008/api/v1/minerva',
    );
  }

  /** Headers M2M requeridos por InternalTokenGuard del integration-service */
  private get authHeaders() {
    const token = this.config.get<string>('ABAC_M2M_TOKEN', '');
    return { Authorization: `Bearer ${token}` };
  }

  /**
   * Desenvuelve la capa { success, data, ... } que añade
   * TransformResponseInterceptor en el integration-service.
   */
  private unwrap<T>(raw: any): T {
    return (raw?.data !== undefined ? raw.data : raw) as T;
  }

  /**
   * Describe la causa de un fallo contra integration-service: status HTTP
   * si respondió, código de red (ECONNREFUSED, ETIMEDOUT, ...) si no.
   */
  private describeError(err: unknown): string {
    if (err instanceof AxiosError) {
      if (err.response) return `status=${err.response.status}`;
      if (err.code) return err.code;
      return err.message;
    }
    return (err as Error)?.message ?? String(err);
  }

  @Get('devices/:serialNumber')
  async getBySerial(@Param('serialNumber') serialNumber: string) {
    try {
      const { data: raw } = await firstValueFrom(
        this.http.get(
          `${this.inventoryUrl}/devices/${encodeURIComponent(serialNumber)}`,
          { headers: this.authHeaders },
        ),
      );
      // integration-service devuelve MinervaDevice — transformamos al formato ApiDevice
      const data = this.unwrap<any>(raw);
      return {
        serial_number: data.serialNumber,
        model: data.model ?? null,
        brand: data.brand ?? null,
        device_type: data.deviceType ?? null,
        assigned_user: data.assignedTo
          ? {
              userId: data.assignedTo,
              nombre: data.assignedUserName ?? data.assignedTo,
            }
          : null,
      };
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 404) {
        throw new HttpException('Device not found', HttpStatus.NOT_FOUND);
      }
      if (err instanceof AxiosError) {
        this.logger.warn(
          `Inventory proxy getBySerial(${serialNumber}): integration-service unreachable (${this.describeError(err)})`,
        );
      } else {
        this.logger.error(
          `Inventory proxy getBySerial(${serialNumber}): unexpected error`,
          (err as Error)?.stack,
        );
      }
      throw new HttpException(
        'Inventory service unavailable',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @Get('users/:userId')
  async getByUser(@Param('userId') userId: string) {
    try {
      const { data: raw } = await firstValueFrom(
        this.http.get(
          `${this.inventoryUrl}/users/${encodeURIComponent(userId)}/devices`,
          { headers: this.authHeaders },
        ),
      );
      const data = this.unwrap<any>(raw);
      const devices: any[] = Array.isArray(data) ? data : [];
      return devices.map((d: any) => ({
        serial_number: d.serialNumber,
        model: d.model ?? null,
        brand: d.brand ?? null,
        device_type: d.deviceType ?? null,
        assigned_user: d.assignedTo
          ? { userId: d.assignedTo, nombre: d.assignedUserName ?? d.assignedTo }
          : null,
      }));
    } catch (err) {
      if (err instanceof AxiosError && err.response?.status === 404) {
        return [];
      }
      if (err instanceof AxiosError) {
        this.logger.warn(
          `Inventory proxy getByUser(${userId}): integration-service unreachable (${this.describeError(err)})`,
        );
      } else {
        this.logger.error(
          `Inventory proxy getByUser(${userId}): unexpected error`,
          (err as Error)?.stack,
        );
      }
      throw new HttpException(
        'Inventory service unavailable',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
