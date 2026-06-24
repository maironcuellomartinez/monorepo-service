import { registerAs } from "@nestjs/config";

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

// SERVICENOW: Base url and path request.
export const routesServiceNow =  registerAs('routes_service_now', () => ({
    base_url_servicenow: process.env.BASE_URL_SERVICENOW,
    incident_path_servicemow: process.env.INCIDENT_PATH_SERVICEMOW,
    change_request_path_servicemow: process.env.CHANGE_REQUEST_PATH_SERVICEMOW,
    service_catalog_path_servicemow: process.env.SERVICE_CATALOG_PATH_SERVICEMOW,
    problem_path_servicemow: process.env.PROBLEM_PATH_SERVICEMOW,
    knowledge_article_path_servicemow: process.env.KNOWLEDGE_ARTICLE_PATH_SERVICEMOW,
    release_task_path_servicemow: process.env.RELEASE_TASK_PATH_SERVICEMOW,
    configuration_item_path_servicemow: process.env.CONFIGURATION_ITEM_PATH_SERVICEMOW,
}));

// REQUESTTYPE: configuration RequestType enum
export const requestTypeConfig = registerAs('request_type_config', () => ({
    incident: process.env.INCIDENT,
    change_request: process.env.CHANGE_REQUEST,
    service_catalog: process.env.SERVICE_CATALOG,
    problem: process.env.PROBLEM,
    knowledge_article: process.env.KNOWLEDGE_ARTICLE,
    release_task: process.env.RELEASE_TASK,
    configuration_item: process.env.CONFIGURATION_ITEM,
}));

