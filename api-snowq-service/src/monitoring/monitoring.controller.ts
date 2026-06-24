import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ThrukAlertDto } from './dto/thruk-alert.dto';
import { MonitoringService } from './monitoring.service';

/**
 * Controller exclusivo para el flujo de monitoreo Nagios/Thruk.
 *
 * Completamente aislado de /snow-requests — no afecta al monolito ni
 * a otras aplicaciones que usan el controller estándar.
 *
 * Thruk configura dos notification commands:
 *
 *   Problema  → POST /monitoring/alerts       (body: ThrukAlertDto)
 *   Recovery  → POST /monitoring/alerts       (mismo endpoint, notificationType=RECOVERY)
 *               o POST /monitoring/cancel/:fingerprint  (si ya conoce el fingerprint)
 *
 * La capa de decisión en MonitoringService determina qué hacer con cada
 * notificación antes de tocar la cola o ServiceNow.
 */
@Controller('monitoring')
export class MonitoringController {
    constructor(private readonly monitoringService: MonitoringService) { }

    /**
     * Punto de entrada único para todas las notificaciones de Thruk.
     *
     * La decisión sobre qué hacer (encolar, deduplicar, cancelar, ignorar)
     * la toma MonitoringService basándose en notificationType y stateType.
     *
     * Siempre devuelve 200 — Thruk no debe reintentar por errores de lógica
     * de negocio (el reintento lo gestiona api-snowq-service internamente).
     */
    @Post('alerts')
    @HttpCode(HttpStatus.OK)
    async handleAlert(@Body() dto: ThrukAlertDto) {
        return this.monitoringService.handleAlert(dto);
    }

    /**
     * Cancela explícitamente un ticket pendiente por fingerprint.
     *
     * Alternativa al envío de notificationType=RECOVERY cuando Thruk
     * ya conoce el fingerprint y quiere cancelar directamente.
     *
     * El fingerprint debe codificarse en la URL:
     *   POST /monitoring/cancel/host%3Dweb01%3Bservice%3DHTTP
     */
    @Post('cancel/:fingerprint')
    @HttpCode(HttpStatus.OK)
    async cancelByFingerprint(@Param('fingerprint') fingerprint: string) {
        return this.monitoringService.cancelByFingerprint(decodeURIComponent(fingerprint));
    }
}
