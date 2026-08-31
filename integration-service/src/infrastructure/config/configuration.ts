// src/infrastructure/config/configuration.ts
export const configuration = () => ({
    environment: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3008', 10),

    minerva: {
        soapWsdlUrl: process.env.MINERVA_SOAP_WSDL_URL || 'http://localhost:3016/devices?wsdl',
        timeout: parseInt(process.env.MINERVA_TIMEOUT || '10000', 10),
    },

    droppoint: {
        baseUrl: process.env.DROPPOINT_BASE_URL || 'https://inetum.drop-point.com/company_api/v5',
        username: process.env.DROPPOINT_USERNAME || '',
        password: process.env.DROPPOINT_PASSWORD || '',
        timeout: parseInt(process.env.DROPPOINT_TIMEOUT || '10000', 10),
    },

    // outlook-calendar.connector.ts lee estas claves — nunca estuvieron
    // mapeadas acá, así que el conector jamás pudo inicializarse (siempre
    // caía en el warn "Outlook Calendar configuration incomplete" y
    // retornaba temprano, sin importar lo que hubiera en AZURE_TENANT_ID/
    // CLIENT_ID/CLIENT_SECRET).
    outlook: {
        tenantId: process.env.AZURE_TENANT_ID || '',
        clientId: process.env.AZURE_CLIENT_ID || '',
        clientSecret: process.env.AZURE_CLIENT_SECRET || '',
        userId: process.env.OUTLOOK_USER_ID || 'me',
        timeout: parseInt(process.env.OUTLOOK_TIMEOUT || '10000', 10),
    },

    throttler: {
        ttl: parseInt(process.env.THROTTLER_TTL || '60', 10),
        limit: parseInt(process.env.THROTTLER_LIMIT || '10', 10),
    },

    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: process.env.CORS_CREDENTIALS === 'true',
    },

    security: {
        apiKey: process.env.API_KEY,
        jwtIssuer: process.env.JWT_ISSUER || 'abac-service',
        jwtAudience: process.env.JWT_AUDIENCE || 'abac-clients',
    },

    abac: {
        url: process.env.ABAC_URL || 'http://localhost:3005',
        appId: process.env.ABAC_APP_ID || '',
        m2mToken: process.env.ABAC_M2M_TOKEN || '',
    },
});
