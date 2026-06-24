import { Injectable, Inject } from '@nestjs/common';
import { IExternalConnector } from 'src/domain/interfaces/external-connector.interface';

export type ExternalSystemType =
    | 'SERVICENOW'
    | 'SNOWQ'
    | 'MINERVA'
    | 'DROPPOINT'
    | 'OUTLOOK_CALENDAR';

@Injectable()
export class ConnectorRegistry {
    constructor(
        @Inject('EXTERNAL_CONNECTORS')
        private readonly connectors: Record<ExternalSystemType, IExternalConnector>,
    ) { }

    getConnector(systemType: ExternalSystemType): IExternalConnector {
        const connector = this.connectors[systemType];

        if (!connector) {
            throw new Error(`No connector found for system type: ${systemType}`);
        }

        return connector;
    }

    getAllConnectors(): IExternalConnector[] {
        return Object.values(this.connectors);
    }

    isSystemAvailable(systemType: ExternalSystemType): boolean {
        try {
            const connector = this.getConnector(systemType);
            return connector !== undefined;
        } catch {
            return false;
        }
    }
}