// src/infrastructure/external/external.module.ts
import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { OutlookCalendarConnector } from './connectors/outlook-calendar.connector';
import { MinervaConnector } from './connectors/minerva.connector';
import { MinervaSoapClient } from './connectors/minerva-soap.client';
import { DroppointConnector } from './connectors/droppoint.connector';

import { CalendarAdapter } from './adapters/calendar.adapter';

import { ConnectorRegistry } from './registries/connector.registry';

@Global()
@Module({
    imports: [
        HttpModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                timeout: configService.get('http.timeout', 10000),
                maxRedirects: configService.get('http.maxRedirects', 5),
                headers: {
                    'User-Agent': `IntegrationService/${process.env.npm_package_version || '1.0.0'}`,
                },
            }),
            inject: [ConfigService],
        }),
    ],
    providers: [
        // Connectors
        OutlookCalendarConnector,
        MinervaSoapClient,
        MinervaConnector,
        DroppointConnector,

        // Adapters
        CalendarAdapter,

        // Registries
        ConnectorRegistry,

        // Provider para inyección por nombre de sistema
        {
            provide: 'EXTERNAL_CONNECTORS',
            useFactory: (
                outlookCal: OutlookCalendarConnector,
                minerva: MinervaConnector,
                droppoint: DroppointConnector,
            ) => ({
                OUTLOOK_CALENDAR: outlookCal,
                MINERVA: minerva,
                DROPPOINT: droppoint,
            }),
            inject: [
                OutlookCalendarConnector,
                MinervaConnector,
                DroppointConnector,
            ],
        },
    ],
    exports: [
        OutlookCalendarConnector,
        MinervaSoapClient,
        MinervaConnector,
        DroppointConnector,
        ConnectorRegistry,
        'EXTERNAL_CONNECTORS',
        HttpModule,
    ],
})
export class ExternalModule { }
