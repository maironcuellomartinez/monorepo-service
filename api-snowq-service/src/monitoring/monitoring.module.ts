import { Module } from '@nestjs/common';
import { SnowRequestsModule } from 'src/snow-requests/snow-requests.module';
import { ServiceNowModule } from 'src/servicenow/servicenow.module';
import { MonitoringController } from './monitoring.controller';
import { MonitoringService } from './monitoring.service';
import { MonitoringReconcilerService } from './monitoring-reconciler.service';

/**
 * Módulo aislado para el flujo de monitoreo Nagios/Thruk.
 *
 * Comparte la infraestructura de persistencia (SnowRequestsModule)
 * con el flujo estándar, pero tiene su propia lógica de decisión
 * y sus propios endpoints — completamente transparente para el monolito
 * y otras aplicaciones que usan /snow-requests.
 */
@Module({
    imports: [SnowRequestsModule, ServiceNowModule],
    controllers: [MonitoringController],
    providers: [MonitoringService, MonitoringReconcilerService],
    exports: [MonitoringReconcilerService],
})
export class MonitoringModule { }
