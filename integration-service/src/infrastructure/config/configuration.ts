// src/infrastructure/config/configuration.ts
export const configuration = () => ({
    environment: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3008', 10),

    database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '3306', 10),
        username: process.env.DB_USERNAME || 'root',
        password: process.env.DB_PASSWORD || 'root',
        database: process.env.DB_NAME || 'integration_db',
        synchronize: process.env.NODE_ENV !== 'production',
        logging: false, //process.env.NODE_ENV === 'development',
    },

    servicenow: {
        baseUrl: process.env.SERVICENOW_BASE_URL,
        username: process.env.SERVICENOW_USERNAME,
        password: process.env.SERVICENOW_PASSWORD,
        timeout: parseInt(process.env.SERVICENOW_TIMEOUT || '10000', 10),
        useSnowq: process.env.SERVICENOW_USE_SNOWQ === 'true',
    },

    snowq: {
        baseUrl: process.env.SNOWQ_BASE_URL || 'http://localhost:3090',
        timeout: parseInt(process.env.SNOWQ_TIMEOUT || '10000', 10),
    },

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

    throttler: {
        ttl: parseInt(process.env.THROTTLER_TTL || '60', 10),
        limit: parseInt(process.env.THROTTLER_LIMIT || '10', 10),
    },

    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: process.env.CORS_CREDENTIALS === 'true',
    },

    security: {
        jwtSecret: process.env.JWT_SECRET,
        apiKey: process.env.API_KEY,
    },

    abac: {
        url: process.env.ABAC_URL || 'http://localhost:3005',
        m2mToken: process.env.ABAC_M2M_TOKEN || '',
    },
});
