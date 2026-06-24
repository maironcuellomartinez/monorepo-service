export const retryConfiguration = () => ({
    retry: {
        // Configuración global de reintentos
        maxRetries: parseInt(process.env.RETRY_MAX_RETRIES || '3', 10),
        initialDelay: parseInt(process.env.RETRY_INITIAL_DELAY || '1000', 10),
        maxDelay: parseInt(process.env.RETRY_MAX_DELAY || '30000', 10),
        multiplier: parseFloat(process.env.RETRY_MULTIPLIER || '2'),
        jitter: process.env.RETRY_JITTER !== 'false',

        // Errores específicos que son reintentables
        retryableErrors: [
            'ECONNRESET',
            'ETIMEDOUT',
            'ECONNREFUSED',
            'ENOTFOUND',
            'EAI_AGAIN',
            'ESOCKETTIMEDOUT',
            'timeout',
            'network',
            'connection',
        ],

        // Configuración por tipo de evento
        eventPolicies: {
            'appointment.created': {
                maxRetries: 5,
                initialDelay: 2000,
                maxDelay: 60000,
            },
            'payment.processed': {
                maxRetries: 3,
                initialDelay: 5000,
                maxDelay: 120000,
            },
            'inventory.reserved': {
                maxRetries: 4,
                initialDelay: 3000,
            },
        },

        // Configuración por sistema
        systemPolicies: {
            'SERVICENOW': {
                maxRetries: 4,
                initialDelay: 3000,
                retryableErrors: [
                    'ECONNRESET',
                    'ETIMEDOUT',
                    'read ECONNRESET',
                    'ServiceNow API unavailable',
                ],
            },
            'LOCKER': {
                maxRetries: 3,
                initialDelay: 2000,
                maxDelay: 30000,
            },
            'GOOGLE_CALENDAR': {
                maxRetries: 2,
                initialDelay: 1000,
            },
        },
    },
});