import axios from 'axios'

// En development el proxy de Vite redirige /api → localhost:3000, sin CORS.
// En staging/prod VITE_GATEWAY_URL apunta al gateway real.
const BASE_URL = import.meta.env.VITE_GATEWAY_URL || ''

function attachAuthHeader(config: import('axios').InternalAxiosRequestConfig) {
  const token = sessionStorage.getItem('ec_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
}

// ─── Main API client — triggers global logout on 401 ────────────────────────

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use(attachAuthHeader)

// Guard: only fire the unauthorized event once per session expiry.
// Multiple concurrent requests can all return 401 simultaneously; without
// this flag every one of them would trigger a logout dispatch.
let _unauthorizedPending = false

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !_unauthorizedPending) {
      _unauthorizedPending = true
      sessionStorage.removeItem('ec_token')
      sessionStorage.removeItem('ec_user')
      window.dispatchEvent(new Event('ec:unauthorized'))
    }
    return Promise.reject(error)
  },
)

// Called by auth context on successful login so the guard resets for the new session.
export function resetUnauthorizedGuard() {
  _unauthorizedPending = false
}

// ─── Availability client — does NOT trigger global logout on 401 ─────────────
// Availability calls are fire-and-forget data fetches; a 401 here means the
// corner/resource is not accessible, not that the session has expired.
// Errors surface as in-page messages instead of booting the user out.

export const availabilityClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

availabilityClient.interceptors.request.use(attachAuthHeader)

// ─── Auth utilities ──────────────────────────────────────────────────────────

function btoa_url(str: string): string {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export interface MeResponse {
  abacUserId: string
  email: string
  firstName: string
  lastName: string
  username: string
  permissions: string[]
  monolithUserId: string
  companyId: string | null
  principalName: string | null
  isActive: boolean
  technicianId: string | null
}

export const authApi = {
  buildDevToken(oid: string, email: string, name?: string): string {
    const payload = JSON.stringify({ oid, email, name: name ?? email })
    return 'dev:' + btoa_url(payload)
  },

  async me(): Promise<MeResponse> {
    const { data } = await apiClient.get<MeResponse>('/api/auth/me')
    return data
  },
}

// ─── ABAC ────────────────────────────────────────────────────────────────────

export interface AbacCheckItem {
  resource: string
  action: string
  context?: Record<string, unknown>
}

export interface AbacCheckResult {
  resource: string
  action: string
  granted: boolean
}

export const abacApi = {
  /**
   * Evalúa en lote permisos para el usuario autenticado.
   * El gateway inyecta userId + applicationId desde el JWT.
   */
  batchEvaluate: (checks: AbacCheckItem[]): Promise<AbacCheckResult[]> =>
    apiClient
      .post<{ results: AbacCheckResult[] }>('/api/abac/batch-evaluate', { checks })
      .then((r) => r.data.results),
}

// ─── Corners ─────────────────────────────────────────────────────────────────

export interface Corner {
  id: string
  name: string
  clientName: string
  slotDurationMinutes: number
  description?: string
  country?: string
  city?: string | null
  timezone?: string
  latitude?: number
  longitude?: number
  onlyTechnicians?: boolean
  servicenowLocation?: string
  snowAssignmentGroup?: string
  isActive: boolean
  schedules?: CornerSchedule[]
  technicians?: Technician[]
  createdAt: string
  updatedAt: string
}

export interface CornerSchedule {
  id: string
  cornerId: string
  name: string
  dayOfWeek?: string | null
  startTime: string
  endTime: string
  validFrom: string
  validUntil: string
  slotDurationMinutes: number
  isActive: boolean
  technicians?: Technician[]
}

export interface Technician {
  id: string
  name: string
  email: string
  cornerId: string
  isActive: boolean
}

export const cornersApi = {
  list: () => apiClient.get<Corner[]>('/api/corners').then((r) => r.data),
  getById: (id: string) => apiClient.get<Corner>(`/api/corners/${id}`).then((r) => r.data),
  create: (dto: Partial<Corner>) => apiClient.post<Corner>('/api/corners', dto).then((r) => r.data),
  update: (id: string, dto: Partial<Corner>) =>
    apiClient.put<Corner>(`/api/corners/${id}`, dto).then((r) => r.data),
  deactivate: (id: string) => apiClient.delete(`/api/corners/${id}`).then((r) => r.data),
  addSchedule: (cornerId: string, dto: Partial<CornerSchedule>) =>
    apiClient.post<CornerSchedule>(`/api/corners/${cornerId}/schedules`, dto).then((r) => r.data),
  getSchedules: (cornerId: string) =>
    apiClient.get<CornerSchedule[]>(`/api/corners/${cornerId}/schedules`).then((r) => r.data),
  updateSchedule: (cornerId: string, scheduleId: string, dto: Partial<CornerSchedule>) =>
    apiClient.put<CornerSchedule>(`/api/corners/${cornerId}/schedules/${scheduleId}`, dto).then((r) => r.data),
  deleteSchedule: (cornerId: string, scheduleId: string) =>
    apiClient.delete(`/api/corners/${cornerId}/schedules/${scheduleId}`).then((r) => r.data),
  assignTechnicians: (cornerId: string, scheduleId: string, dto: { technicianIds: string[] }) =>
    apiClient
      .post(`/api/corners/${cornerId}/schedules/${scheduleId}/technicians`, dto)
      .then((r) => r.data),
}

// ─── Availability ─────────────────────────────────────────────────────────────

export interface AvailabilitySlot {
  startTime: string
  endTime: string
  available: boolean
  slotIds: string[]
  heldByCurrentUser?: boolean
  /** true si el bloqueo es solo por holds vigentes (lote en preparación), no por reservas */
  held?: boolean
  technicians: {
    total: number
    available: number
    availableNames: string[]
    occupied: Array<{ id: string; name: string; occupiedUntil: string | null }>
  }
  occupiedSlots?: string[]
}

export const availabilityApi = {
  getSlots: (cornerId: string, date: string, duration: number, signal?: AbortSignal, userId?: string) =>
    availabilityClient
      .get<AvailabilitySlot[]>(`/api/availability/${cornerId}`, { params: { date, duration, userId }, signal })
      .then((r) => r.data),
  getTechnicians: (cornerId: string, date: string) =>
    availabilityClient
      .get<{ technicianId: string; name: string; available: boolean; occupiedUntil?: string }[]>(
        `/api/availability/${cornerId}/technicians`,
        { params: { date } },
      )
      .then((r) => r.data),
}

// ─── Incidents ────────────────────────────────────────────────────────────────

export type IncidentStatus =
  | 'CREATED'
  | 'DELIVERED'
  | 'IN_PROGRESS'
  | 'PAUSED'
  | 'PENDING_THIRD_PARTY'
  | 'PENDING_USER'
  | 'PENDING_SPARE_PART'
  | 'PENDING_PICKUP'
  | 'PENDING_REPLACEMENT_DELIVERY'
  | 'CLOSED'
  | 'VALIDATED'
  | 'REOPENED'
  | 'CANCELED'

export interface Incident {
  id: string
  status: IncidentStatus
  customerId: string
  customer?: { id: string; email: string; name?: string }
  cornerId: string
  corner?: Corner
  issueTypeId: string
  issueType?: IssueType
  currentTechnicianId?: string
  technician?: { id: string; name: string }
  deviceId?: string
  device?: { serialNumber: string; model: string | null; brand: string | null }
  lockerId?: string
  notes?: string
  servicenowId?: string
  servicenowNumber?: string
  snowqCorrelationId?: string
  scheduledRange?: { start: string; end: string }
  createdAt: string
  updatedAt: string
}

export interface IncidentFilters {
  cornerId?: string
  status?: string
  issueTypeId?: string
  customerId?: string
  customerEmail?: string
  servicenowNumber?: string
  deviceSerial?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  limit?: number
  /** Si es true, oculta incidencias que ya tienen técnico asignado */
  availableOnly?: boolean
}

export interface PaginatedIncidents {
  data: Incident[]
  total: number
  page: number
  limit: number
}

export const incidentsApi = {
  list: (params?: { cornerId?: string; status?: string }) =>
    apiClient
      .get<Incident[]>('/api/incidents/available', { params })
      .then((r) => r.data),
  listFiltered: (params?: IncidentFilters) => {
    const p = params ? { ...params, availableOnly: params.availableOnly ? 'true' : undefined } : undefined
    return apiClient.get<PaginatedIncidents>('/api/incidents', { params: p }).then((r) => r.data)
  },
  mine: () =>
    apiClient
      .get<PaginatedIncidents>('/api/incidents/mine')
      .then((r) => r.data),
  byTechnician: (technicianId: string) =>
    apiClient
      .get<Incident[]>(`/api/incidents/technician/${technicianId}`)
      .then((r) => r.data),
  getById: (id: string) => apiClient.get<Incident>(`/api/incidents/${id}`).then((r) => r.data),
  create: (dto: {
    cornerId: string
    issueTypeId: string
    customerId: string
    slotIds: string[]
    startTime: string
    endTime: string
    origin: string
    device?: { serialNumber: string }
    notes?: string
  }) =>
    apiClient.post<Incident>('/api/incidents', dto).then((r) => r.data),
  changeStatus: (id: string, dto: { technicianId: string; newStatus: IncidentStatus; comment?: string }) =>
    apiClient.patch<Incident>(`/api/incidents/${id}/status`, dto).then((r) => r.data),
  cancel: (id: string, customerId: string, reason?: string) =>
    apiClient.patch<Incident>(`/api/incidents/${id}/cancel`, { customerId, reason }).then((r) => r.data),
  take: (id: string, dto: { technicianId: string }) =>
    apiClient.patch<Incident>(`/api/incidents/${id}/take`, dto).then((r) => r.data),
  release: (id: string, technicianId: string, reason?: string) =>
    apiClient.patch<Incident>(`/api/incidents/${id}/release`, { technicianId, reason }).then((r) => r.data),
  deliver: (id: string, dto: { notes?: string }) =>
    apiClient.patch<Incident>(`/api/incidents/${id}/deliver`, dto).then((r) => r.data),
  validate: (id: string, customerId: string) =>
    apiClient.patch<Incident>(`/api/incidents/${id}/validate`, { customerId }).then((r) => r.data),
  reopen: (id: string, customerId: string, dto?: { reason?: string }) =>
    apiClient.patch<Incident>(`/api/incidents/${id}/reopen`, { customerId, ...dto }).then((r) => r.data),
  getTimeline: (id: string) =>
    apiClient.get<IncidentTimelineEntry[]>(`/api/incidents/${id}/timeline`).then((r) => r.data),
  addNote: (id: string, dto: { technicianId?: string; comment: string }) =>
    apiClient.post(`/api/incidents/${id}/notes`, dto).then((r) => r.data),
}

export interface IncidentTimelineEntry {
  activityId: string
  incidentId: string
  technicianId: string | null
  technicianName: string | null
  actionType: string
  fromStatus: string | null
  toStatus: string | null
  comment: string | null
  createdAt: string
}

// ─── Requests ─────────────────────────────────────────────────────────────────

export type RequestStatus = 'CREATED' | 'IN_PROGRESS' | 'CLOSED' | 'CANCELLED'

export interface ServiceRequest {
  id: string
  status: RequestStatus
  customerId: string
  customer?: { id: string; email: string; name?: string }
  cornerId: string
  corner?: Corner
  issueTypeId: string
  issueType?: IssueType
  technicianId?: string
  technician?: Technician
  deviceId?: string
  notes?: string
  servicenowId?: string
  servicenowNumber?: string
  snowqCorrelationId?: string
  scheduledRange?: { start: string; end: string }
  createdAt: string
  updatedAt: string
}

export const requestsApi = {
  list: (params?: { customerId?: string; technicianId?: string }) =>
    apiClient.get<ServiceRequest[]>('/api/requests', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get<ServiceRequest>(`/api/requests/${id}`).then((r) => r.data),
  create: (dto: Partial<ServiceRequest>) =>
    apiClient.post<ServiceRequest>('/api/requests', dto).then((r) => r.data),
  changeStatus: (id: string, dto: { status: RequestStatus; reason?: string }) =>
    apiClient.patch<ServiceRequest>(`/api/requests/${id}/status`, dto).then((r) => r.data),
}

// ─── Issue Types ──────────────────────────────────────────────────────────────

export interface IssueType {
  id: string
  name: string
  category?: string
  description?: string
  deviceType?: string
  servicenowCategory?: string
  servicenowCloseCategory?: string
  workMinutes?: number
  spareMinutes?: number
  closeMinutes?: number
  notUserVisible?: boolean
  visibleToUsers?: boolean
  isActive?: boolean
  position?: number
  icon?: string
  npsDisabled?: boolean
  issueTypeTreeId?: string
  treeId?: string
  createdAt?: string
  updatedAt?: string
}

export const issueTypesApi = {
  list: (params?: { treeId?: string; category?: string; deviceType?: string }) =>
    apiClient.get<IssueType[]>('/api/admin/issue-types', { params }).then((r) => r.data),
  getById: (id: string) =>
    apiClient.get<IssueType>(`/api/admin/issue-types/${id}`).then((r) => r.data),
  create: (dto: Partial<IssueType>) =>
    apiClient.post<IssueType>('/api/admin/issue-types', dto).then((r) => r.data),
  update: (id: string, dto: Partial<IssueType>) =>
    apiClient.put<IssueType>(`/api/admin/issue-types/${id}`, dto).then((r) => r.data),
  remove: (id: string) =>
    apiClient.delete(`/api/admin/issue-types/${id}`).then((r) => r.data),
}

// ─── Companies ───────────────────────────────────────────────────────────────

export interface Company {
  id: string
  name: string
  treeId?: string
  profileId?: string | null
  isDefault?: boolean
  isActive?: boolean
  createdAt?: string
  updatedAt?: string
}

export interface IssueTypeTree {
  id: string
  name: string
}

export interface SnProfile {
  id: string
  name: string
  snowCompanySysId: string
  snowCompanyName: string
  isActive?: boolean
}

export const treesApi = {
  list: () =>
    apiClient.get<IssueTypeTree[]>('/api/admin/trees').then((r) => r.data),
  create: (dto: { id: string; name: string }) =>
    apiClient.post<IssueTypeTree>('/api/admin/trees', dto).then((r) => r.data),
  rename: (id: string, name: string) =>
    apiClient.put<IssueTypeTree>(`/api/admin/trees/${id}`, { name }).then((r) => r.data),
  remove: (id: string) =>
    apiClient.delete(`/api/admin/trees/${id}`).then((r) => r.data),
}

export const companiesApi = {
  list: () =>
    apiClient.get<Company[]>('/api/admin/companies').then((r) => r.data),
  getById: (id: string) =>
    apiClient.get<Company>(`/api/admin/companies/${id}`).then((r) => r.data),
  listTrees: () =>
    apiClient.get<IssueTypeTree[]>('/api/admin/companies/trees').then((r) => r.data),
  listSnProfiles: () =>
    apiClient.get<SnProfile[]>('/api/admin/companies/sn-profiles').then((r) => r.data),
  create: (dto: { name: string; treeId: string; profileId?: string | null }) =>
    apiClient.post<Company>('/api/admin/companies', dto).then((r) => r.data),
  update: (id: string, dto: Partial<Company>) =>
    apiClient.put<Company>(`/api/admin/companies/${id}`, dto).then((r) => r.data),
  remove: (id: string) =>
    apiClient.delete(`/api/admin/companies/${id}`).then((r) => r.data),
  bulkImportCompanies: (companies: Array<{ name: string; treeId: string; profileId?: string | null }>) =>
    apiClient
      .post<{ created: number; companies: Company[]; errors: Array<{ row: number; message: string }> }>(
        '/api/admin/companies/bulk',
        { companies },
      )
      .then((r) => r.data),
  createSnProfile: (dto: { name: string; snowCompanySysId: string; snowCompanyName: string }) =>
    apiClient.post<SnProfile>('/api/admin/companies/sn-profiles', dto).then((r) => r.data),
  updateSnProfile: (id: string, dto: { name?: string; snowCompanySysId?: string; snowCompanyName?: string; isActive?: boolean }) =>
    apiClient.put<SnProfile>(`/api/admin/companies/sn-profiles/${id}`, dto).then((r) => r.data),
  deleteSnProfile: (id: string) =>
    apiClient.delete(`/api/admin/companies/sn-profiles/${id}`).then((r) => r.data),
  bulkImportSnProfiles: (profiles: Array<{ name: string; snowCompanySysId: string; snowCompanyName: string }>) =>
    apiClient
      .post<{ created: number; profiles: SnProfile[]; errors: Array<{ row: number; message: string }> }>(
        '/api/admin/companies/sn-profiles/bulk',
        { profiles },
      )
      .then((r) => r.data),
  syncFromSn: () =>
    apiClient
      .post<{ synced: number; skipped: number; errors: number }>('/api/admin/companies/sync-from-sn')
      .then((r) => r.data),
}

// ─── Technicians ──────────────────────────────────────────────────────────────

export interface TechnicianProfile {
  id: string
  userId: string | null
  name: string
  lastName: string | null
  fullName: string | null
  email: string
  cornerId: string | null
  disabled: boolean
  createdAt: string
  updatedAt: string
}

export interface UserLookup {
  id: string
  email: string | null
  name: string | null
  lastName: string | null
  fullName: string | null
  isActive: boolean
}

export interface MonolithUser {
  id: string
  externalId: string | null
  email: string | null
  name: string | null
  lastName: string | null
  fullName: string | null
  companyId: string | null
  principalName: string | null
  isActive: boolean
}

export const usersApi = {
  /** Lista usuarios activos CON empresa — para incident creation picker */
  list: () => apiClient.get<MonolithUser[]>('/api/incidents/users').then((r) => r.data),
  /** Busca usuarios activos CON empresa por nombre/email/UPN — para incident creation picker */
  search: (q: string) => apiClient.get<MonolithUser[]>('/api/incidents/users/search', { params: { q } }).then((r) => r.data),
  /** Lista TODOS los usuarios activos (admin) */
  listAll: () => apiClient.get<MonolithUser[]>('/api/admin/users').then((r) => r.data),
  /** Busca usuarios por nombre/email/UPN (admin) */
  searchAll: (q: string) => apiClient.get<MonolithUser[]>('/api/admin/users/search', { params: { q } }).then((r) => r.data),
  /** Actualizar perfil (nombre, apellido, empresa) */
  update: (userId: string, dto: { name?: string; lastName?: string; companyId?: string | null }) =>
    apiClient.patch(`/api/admin/users/${userId}`, dto).then((r) => r.data),
  /** Asignar empresa a un usuario */
  assignCompany: (userId: string, companyId: string | null) =>
    apiClient.patch(`/api/admin/users/${userId}`, { companyId }).then((r) => r.data),
  /** Desactivar usuario */
  deactivate: (userId: string) =>
    apiClient.patch(`/api/admin/users/${userId}/deactivate`).then((r) => r.data),
  /** Activar usuario */
  activate: (userId: string) =>
    apiClient.patch(`/api/admin/users/${userId}/activate`).then((r) => r.data),
  /** Eliminar usuario */
  remove: (userId: string) =>
    apiClient.delete(`/api/admin/users/${userId}`).then((r) => r.data),
}

// ─── Devices ──────────────────────────────────────────────────────────────────

export interface DeviceSummary {
  id: string
  serialNumber: string
  model: string | null
  brand: string | null
  deviceType: string | null
  status: string
  isVirtual: boolean
}

export const devicesApi = {
  /** Lista dispositivos asignados a un usuario (desde DB local) */
  listByUser: (userId: string) =>
    apiClient.get<DeviceSummary[]>('/api/devices', { params: { userId } }).then((r) => r.data),

  /** Sincroniza los dispositivos del usuario desde Minerva (inventario externo) y retorna el resultado */
  syncForUser: (userId: string) =>
    apiClient.post<{ synced: number; errors: number }>(`/api/devices/sync-user/${userId}`).then((r) => r.data),

  /** Crea un dispositivo virtual para el usuario */
  createVirtual: (userId: string, deviceType: string, model?: string, serialNumber?: string) =>
    apiClient.post<DeviceSummary>('/api/devices/virtual', { userId, deviceType, model, serialNumber }).then((r) => r.data),

  /** Actualiza los campos de un dispositivo virtual */
  updateVirtual: (deviceId: string, data: { serialNumber?: string; deviceType?: string; model?: string | null; brand?: string | null }) =>
    apiClient.patch<DeviceSummary>(`/api/devices/virtual/${deviceId}`, data).then((r) => r.data),

  /** Deshabilita un dispositivo */
  disableDevice: (deviceId: string) =>
    apiClient.post<{ disabled: boolean }>(`/api/devices/${deviceId}/disable`).then((r) => r.data),

  /** Habilita un dispositivo deshabilitado */
  enableDevice: (deviceId: string) =>
    apiClient.post<{ enabled: boolean }>(`/api/devices/${deviceId}/enable`).then((r) => r.data),

  /** Elimina un dispositivo virtual */
  deleteVirtual: (deviceId: string) =>
    apiClient.delete<{ deleted: boolean }>(`/api/devices/virtual/${deviceId}`).then((r) => r.data),
}

export const techniciansApi = {
  /** Lista todos los técnicos, o solo los de un corner si se pasa cornerId */
  list: (cornerId?: string) =>
    apiClient.get<TechnicianProfile[]>('/api/admin/technicians', { params: cornerId ? { cornerId } : {} }).then((r) => r.data),

  /** Crea un técnico vinculando un User existente (cornerId es opcional) */
  create: (dto: { userId: string; name: string; email: string; cornerId?: string; lastName?: string }) =>
    apiClient.post<TechnicianProfile>('/api/admin/technicians', dto).then((r) => r.data),

  /** Asigna un técnico existente a un corner */
  assignCorner: (id: string, cornerId: string) =>
    apiClient.patch<TechnicianProfile>(`/api/admin/technicians/${id}/corner`, { cornerId }).then((r) => r.data),

  disable: (id: string) =>
    apiClient.patch(`/api/admin/technicians/${id}/disable`).then((r) => r.data),

  enable: (id: string) =>
    apiClient.patch(`/api/admin/technicians/${id}/enable`).then((r) => r.data),

  remove: (id: string) =>
    apiClient.delete(`/api/admin/technicians/${id}`).then((r) => r.data),
}

export interface ServiceNowGroup {
  groupId: string
  groupName: string
  description?: string | null
  isActive: boolean
}

export const snowGroupsApi = {
  list: () =>
    apiClient.get<ServiceNowGroup[]>('/api/admin/servicenow-groups').then((r) => r.data),
}

// ─── Batch Drafts ─────────────────────────────────────────────────────────────

export interface BatchDraftItem {
  id: string
  draftId: string
  localId: string
  cornerId: string
  cornerName: string
  customerId: string
  customerName: string
  customerEmail: string
  deviceSerial: string
  issueTypeId: string
  issueTypeName: string
  slotIds: string[]
  startTime: string
  endTime: string
  description: string
  notes: string
  status: 'pending' | 'error'
  lastError: string | null
  createdAt: string
}

export interface BatchDraft {
  id: string
  userId: string
  items: BatchDraftItem[]
  createdAt: string
  updatedAt: string
}

export interface BatchSubmitResultItem {
  localId: string
  status: 'success' | 'error'
  incidentId?: string
  error?: string
}

export interface AddBatchItemCmd {
  localId: string
  cornerId: string
  cornerName: string
  customerId: string
  customerName: string
  customerEmail: string
  deviceSerial: string
  issueTypeId: string
  issueTypeName: string
  slotIds: string[]
  startTime: string
  endTime: string
  description: string
  notes?: string
}

export interface EditBatchItemCmd {
  cornerId?: string
  cornerName?: string
  customerId?: string
  customerName?: string
  customerEmail?: string
  deviceSerial?: string
  issueTypeId?: string
  issueTypeName?: string
  slotIds?: string[]
  startTime?: string
  endTime?: string
  description?: string
  notes?: string
}

export const batchDraftsApi = {
  getMyDraft: () =>
    apiClient.get<BatchDraft | null>('/api/batch-drafts').then((r) => r.data),
  addItem: (cmd: AddBatchItemCmd) =>
    apiClient.post<BatchDraftItem>('/api/batch-drafts/items', cmd).then((r) => r.data),
  editItem: (id: string, cmd: EditBatchItemCmd) =>
    apiClient.patch<void>(`/api/batch-drafts/items/${id}`, cmd).then((r) => r.data),
  removeItem: (id: string) =>
    apiClient.delete(`/api/batch-drafts/items/${id}`).then((r) => r.data),
  submit: () =>
    apiClient.post<BatchSubmitResultItem[]>('/api/batch-drafts/submit', {}).then((r) => r.data),
  discard: () =>
    apiClient.delete('/api/batch-drafts').then((r) => r.data),
  renewHolds: () =>
    apiClient.post<{ renewedUntil: string; count: number }>('/api/batch-drafts/renew', {}).then((r) => r.data),
}
