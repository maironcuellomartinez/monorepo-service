
/**
 * Branded types para type safety en IDs y valores
 * @module Shared/Types
 */

// ==================== BRANDED TYPES ====================
export type Brand<K, T> = K & { readonly __brand: T }

/**
 * Crea un branded type
 * @param brandName - Nombre único para el tipo
 * @returns Función que convierte un valor al branded type
 */
export function brand<T extends string>(_brandName: T) {
    return <K>(value: K) => value as Brand<K, T>
}

// Factory functions para branded types
export const createId = <T extends string>(_brandName: T) =>
    (value: string) => brand(_brandName)(value)

// ==================== BRANDED IDS ====================
export type IncidentId = Brand<string, 'IncidentId'>
export const IncidentId = createId('IncidentId')

export type AppointmentId = Brand<string, 'AppointmentId'>
export const AppointmentId = createId('AppointmentId')

export type CornerId = Brand<string, 'CornerId'>
export const CornerId = createId('CornerId')

export type LockerId = Brand<string, 'LockerId'>
export const LockerId = createId('LockerId')

export type UserId = Brand<string, 'UserId'>
export const UserId = createId('UserId')

export type TechnicianId = Brand<string, 'TechnicianId'>
export const TechnicianId = createId('TechnicianId')

// CustomerId es un alias de UserId: un "cliente" es un User en rol de cliente.
// Usar el mismo branded type elimina fricciones al cruzar del dominio al repositorio de usuarios.
export type CustomerId = UserId
export const CustomerId = UserId

export type DeviceId = Brand<string, 'DeviceId'>
export const DeviceId = createId('DeviceId')

export type ScheduleId = Brand<string, 'ScheduleId'>
export const ScheduleId = createId('ScheduleId')

export type SlotId = Brand<string, 'SlotId'>
export const SlotId = createId('SlotId')

export type EventId = Brand<string, 'EventId'>
export const EventId = createId('EventId')

export type CorrelationId = Brand<string, 'CorrelationId'>
export const CorrelationId = createId('CorrelationId')

export type CausationId = Brand<string, 'CausationId'>
export const CausationId = createId('CausationId')

export type AssignmentId = Brand<string, 'AssignmentId'>
export const AssignmentId = createId('AssignmentId')

export type IssueTypeId = Brand<string, 'IssueTypeId'>
export const IssueTypeId = createId('IssueTypeId')

export type CompanyId = Brand<string, 'CompanyId'>
export const CompanyId = createId('CompanyId')

export type ServiceNowProfileId = Brand<string, 'ServiceNowProfileId'>
export const ServiceNowProfileId = createId('ServiceNowProfileId')

export type IssueTypeTreeId = Brand<string, 'IssueTypeTreeId'>
export const IssueTypeTreeId = createId('IssueTypeTreeId')

export type ActivityId = Brand<string, 'ActivityId'>
export const ActivityId = createId('ActivityId')

export type CornerIssueConfigId = Brand<string, 'CornerIssueConfigId'>
export const CornerIssueConfigId = createId('CornerIssueConfigId')

export type CompanyIssueConfigId = Brand<string, 'CompanyIssueConfigId'>
export const CompanyIssueConfigId = createId('CompanyIssueConfigId')

export type ScheduleBlockId = Brand<string, 'ScheduleBlockId'>
export const ScheduleBlockId = createId('ScheduleBlockId')

export type RequestId = Brand<string, 'RequestId'>
export const RequestId = createId('RequestId')

export type ServiceNowId = Brand<string, 'ServiceNowId'>
export const ServiceNowId = createId('ServiceNowId')

export type ServiceNowNumber = Brand<string, 'ServiceNowNumber'>
export const ServiceNowNumber = createId('ServiceNowNumber')

export type ServiceNowGroup = Brand<string, 'ServiceNowGroup'>
export const ServiceNowGroup = createId('ServiceNowGroup')

export type ServiceNowCategory = Brand<string, 'ServiceNowCategory'>
export const ServiceNowCategory = createId('ServiceNowCategory')

// ==================== VALIDATION GUARDS ====================
/**
 * Verifica si un valor es un IncidentId válido
 * @param input - Valor a verificar
 * @returns true si es un IncidentId válido
 */
export function isIncidentId(input: unknown): input is IncidentId {
    return typeof input === 'string' && input.startsWith('inc_')
}

/**
 * Verifica si un valor es un AppointmentId válido
 * @param input - Valor a verificar
 * @returns true si es un AppointmentId válido
 */
export function isAppointmentId(input: unknown): input is AppointmentId {
    return typeof input === 'string' && input.startsWith('apt_')
}

/**
 * Verifica si un valor es un CornerId válido
 * @param input - Valor a verificar
 * @returns true si es un CornerId válido
 */
export function isCornerId(input: unknown): input is CornerId {
    return typeof input === 'string' && input.startsWith('corner_')
}

/**
 * Verifica si un valor es un TechnicianId válido
 * @param input - Valor a verificar
 * @returns true si es un TechnicianId válido
 */
export function isTechnicianId(input: unknown): input is TechnicianId {
    return typeof input === 'string' && input.startsWith('tech_')
}

/**
 * Verifica si un valor es un UserId válido
 * @param input - Valor a verificar
 * @returns true si es un UserId válido
 */
export function isUserId(input: unknown): input is UserId {
    return typeof input === 'string' && input.startsWith('usr_')
}