// core/ports/outgoing/repositories/tokens.ts
/**
 * Tokens (símbolos) para la inyección de dependencias de repositorios
 * Usamos símbolos en lugar de strings para evitar colisiones
 */

export const SERVICE_NOW_PROFILE_REPOSITORY = Symbol('SERVICE_NOW_PROFILE_REPOSITORY');
export const COMPANY_REPOSITORY = Symbol('COMPANY_REPOSITORY');
export const ISSUE_TYPE_REPOSITORY = Symbol('ISSUE_TYPE_REPOSITORY');
export const CORNER_REPOSITORY = Symbol('CORNER_REPOSITORY');
export const SCHEDULE_REPOSITORY = Symbol('SCHEDULE_REPOSITORY');
export const TECHNICIAN_REPOSITORY = Symbol('TECHNICIAN_REPOSITORY');
export const SLOT_REPOSITORY = Symbol('SLOT_REPOSITORY');
export const INCIDENT_REPOSITORY = Symbol('INCIDENT_REPOSITORY');
export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const DEVICE_REPOSITORY = Symbol('DEVICE_REPOSITORY');
export const LOCKER_REPOSITORY = Symbol('LOCKER_REPOSITORY');
export const REQUEST_REPOSITORY = Symbol('REQUEST_REPOSITORY');
export const ISSUE_TYPE_TREE_REPOSITORY = Symbol('ISSUE_TYPE_TREE_REPOSITORY');
export const CORNER_ISSUE_CONFIG_REPOSITORY = Symbol('COMPANY_ISSUE_CONFIG_REPOSITORY');
export const SERVICENOW_GROUP_REPOSITORY = Symbol('SERVICENOW_GROUP_REPOSITORY');