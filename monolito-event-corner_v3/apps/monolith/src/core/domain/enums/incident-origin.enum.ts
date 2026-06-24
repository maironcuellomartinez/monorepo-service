// core/domain/enums/incident-origin.enum.ts
export enum IncidentOrigin {
    CUSTOMER_APP = 'CUSTOMER_APP',
    MANAGER_PORTAL = 'MANAGER_PORTAL',
    TECH_APP = 'TECH_APP',
    SYSTEM = 'SYSTEM',
    EXTERNAL = 'EXTERNAL'
}

export const USER_INTERACTION_ORIGINS: IncidentOrigin[] = [
    IncidentOrigin.CUSTOMER_APP,
    IncidentOrigin.MANAGER_PORTAL,
    IncidentOrigin.TECH_APP
];

export function isUserInteractionOrigin(origin: IncidentOrigin): boolean {
    return USER_INTERACTION_ORIGINS.includes(origin);
}

export function getOriginName(origin: IncidentOrigin): string {
    const names: Record<IncidentOrigin, string> = {
        [IncidentOrigin.CUSTOMER_APP]: 'Customer App',
        [IncidentOrigin.MANAGER_PORTAL]: 'Manager Portal',
        [IncidentOrigin.TECH_APP]: 'Tech App',
        [IncidentOrigin.SYSTEM]: 'System',
        [IncidentOrigin.EXTERNAL]: 'External'
    };
    return names[origin];
}