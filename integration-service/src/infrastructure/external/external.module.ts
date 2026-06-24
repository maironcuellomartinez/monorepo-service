// src/infrastructure/external/external.module.ts
import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ServiceNowConnector } from './connectors/servicenow.connector';
import { OutlookCalendarConnector } from './connectors/outlook-calendar.connector';
import { SnowqConnector } from './connectors/snowq.connector';
import { MinervaConnector } from './connectors/minerva.connector';
import { MinervaSoapClient } from './connectors/minerva-soap.client';
import { DroppointConnector } from './connectors/droppoint.connector';

import { ServiceNowAdapter } from './adapters/servicenow.adapter';
import { CalendarAdapter } from './adapters/calendar.adapter';

import { ExternalSystemFactory } from './factories/external-system.factory';
import { ConnectorRegistry } from './registries/connector.registry';

import { SnowqServiceNowStrategy } from './strategies/snowq-servicenow.strategy';
import { DirectServiceNowStrategy } from './strategies/direct-servicenow.strategy';

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
        ServiceNowConnector,
        OutlookCalendarConnector,
        SnowqConnector,
        MinervaSoapClient,
        MinervaConnector,
        DroppointConnector,

        // Adapters
        ServiceNowAdapter,
        CalendarAdapter,

        // Factories & Registries
        ExternalSystemFactory,
        ConnectorRegistry,

        // Strategies
        SnowqServiceNowStrategy,
        DirectServiceNowStrategy,

        // SERVICENOW_STRATEGY factory — resolved at runtime based on config
        {
            provide: 'SERVICENOW_STRATEGY',
            useFactory: (config: ConfigService, snowq: SnowqServiceNowStrategy, direct: DirectServiceNowStrategy) => {
                return config.get<boolean>('servicenow.useSnowq', false) ? snowq : direct;
            },
            inject: [ConfigService, SnowqServiceNowStrategy, DirectServiceNowStrategy],
        },

        // Provider para inyección por nombre de sistema
        {
            provide: 'EXTERNAL_CONNECTORS',
            useFactory: (
                serviceNow: ServiceNowConnector,
                outlookCal: OutlookCalendarConnector,
                snowq: SnowqConnector,
                minerva: MinervaConnector,
                droppoint: DroppointConnector,
            ) => ({
                SERVICENOW: serviceNow,
                OUTLOOK_CALENDAR: outlookCal,
                SNOWQ: snowq,
                MINERVA: minerva,
                DROPPOINT: droppoint,
            }),
            inject: [
                ServiceNowConnector,
                OutlookCalendarConnector,
                SnowqConnector,
                MinervaConnector,
                DroppointConnector,
            ],
        },
    ],
    exports: [
        ServiceNowConnector,
        OutlookCalendarConnector,
        SnowqConnector,
        MinervaSoapClient,
        MinervaConnector,
        DroppointConnector,
        ExternalSystemFactory,
        ConnectorRegistry,
        'EXTERNAL_CONNECTORS',
        'SERVICENOW_STRATEGY',
        HttpModule,
    ],
})
export class ExternalModule { }
