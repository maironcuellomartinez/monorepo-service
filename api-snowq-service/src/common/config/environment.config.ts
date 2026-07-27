import { registerAs } from '@nestjs/config';

// DATABASE:
export const databaseConnection = registerAs('database', () => ({
  host_database: process.env.HOST_DATABASE,
  port_database: process.env.PORT_DATABASE,
  username_database: process.env.USERNAME_DATABASE,
  password_database: process.env.PASSWORD_DATABASE,
  database_database: process.env.DATABASE_DATABASE,
  synchronize_database: process.env.SYNCHRONIZE_DATABASE,
  logging_database: process.env.LOGGING_DATABASE,
}));

// SERVICENOW: URL base + auth saliente (Basic legado u OAuth2 JWT Bearer segun SN_AUTH_MODE).
export const serviceNowConfig = registerAs('servicenow', () => ({
  base_url_servicenow: process.env.BASE_URL_SERVICENOW,
  // Nombre del campo custom en SN que guarda la referencia externa (id del
  // monolito + corner.code) — usado para trazabilidad/soporte. Configurable
  // porque el nombre real del campo varía por instancia de ServiceNow.
  external_id_field: process.env.SN_EXTERNAL_ID_FIELD ?? 'u_external_system_id',
  auth_mode: process.env.SN_AUTH_MODE ?? 'basic',
  auth: process.env.SN_AUTH,
  oauth_url: process.env.SN_OAUTH_URL,
  oauth_upn: process.env.SN_OAUTH_UPN,
  oauth_kid: process.env.SN_OAUTH_KID,
  oauth_client_id: process.env.SN_OAUTH_CLIENT_ID,
  oauth_client_secret: process.env.SN_OAUTH_CLIENT_SECRET,
  oauth_iss: process.env.SN_OAUTH_ISS,
  oauth_grant_type:
    process.env.SN_OAUTH_GRANT_TYPE ??
    'urn:ietf:params:oauth:grant-type:jwt-bearer',
  oauth_cert_path: process.env.SN_OAUTH_CERT_PATH,
}));
