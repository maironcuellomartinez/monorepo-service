export enum IssueCategory {
    ISSUE = 'ISSUE',                        // Incidencia de soporte
    CREATE_DELIVERY = 'CREATE-DELIVERY',     // Entrega de equipo
    CREATE_COLLECTION = 'CREATE-COLLECTION', // Recolección de equipo
    REQUEST_ONBOARDING = 'REQUEST-ONBOARDING',   // Alta de empleado
    REQUEST_DECOMISSION = 'REQUEST-DECOMISSION', // Baja/decomisión (una sola M, coincide con el valor real de producción)
}
