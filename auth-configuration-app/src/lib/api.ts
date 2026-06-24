import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_ABAC_API_URL || 'http://localhost:3005',
    headers: { 'Content-Type': 'application/json' },
});

// Interceptor: inyectar JWT en cada request
api.interceptors.request.use((config) => {
    const token = sessionStorage.getItem('abac_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    console.log('config ::', config);
    return config;
});

// Interceptor: manejar 401 → logout
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            sessionStorage.removeItem('abac_token');
            sessionStorage.removeItem('abac_user');
            sessionStorage.removeItem('abac_permissions');
            // Dispara evento para que AuthProvider pueda reaccionar sin hard-redirect
            window.dispatchEvent(new Event('abac:unauthorized'));
        }
        return Promise.reject(error);
    },
);

export default api;

// ── Auth ───────────────────────────────────────────────────────────────────────

export const authApi = {
    login: (email: string, password: string) =>
        api.post('/auth/admin/login', { email, password }),
    /** JWKS endpoint — clave pública Ed25519 para verificación de tokens M2M */
    getJwks: () =>
        api.get<{ keys: { kty: string; crv: string; alg: string; kid: string; x: string }[] }>(
            '/auth/.well-known/jwks.json',
        ),
    /** Genera un nuevo keypair Ed25519 — requiere JWT admin. Devuelve clave privada UNA SOLA VEZ */
    generateKeypair: () =>
        api.post<{
            kid: string;
            publicKey: string;
            privateKey: string;
            warning: string;
            envVars: { abac: string; verifiers: string };
        }>('/auth/admin/keypair'),
};

// ── Users ──────────────────────────────────────────────────────────────────────

export const usersApi = {
    list: (params?: { isActive?: boolean; searchTerm?: string; accountType?: string; page?: number; limit?: number }) =>
        api.get('/users', { params }),
    getById: (id: string) =>
        api.get(`/users/${id}`),
    create: (data: { email: string; name: string; password: string }) =>
        api.post('/users', data),
    update: (id: string, data: Record<string, any>) =>
        api.patch(`/users/${id}`, data),
    deactivate: (id: string) =>
        api.delete(`/users/${id}`),
    reactivate: (id: string) =>
        api.post(`/users/${id}/reactivate`),
    hardDelete: (id: string) =>
        api.delete(`/users/${id}/permanent`),

    // Roles
    getRoles: (userId: string) =>
        api.get(`/users/${userId}/roles`),
    assignRole: (userId: string, roleId: string, applicationId: string) =>
        api.post(`/users/${userId}/roles`, { roleId, applicationId }),
    removeRole: (userId: string, roleId: string) =>
        api.delete(`/users/${userId}/roles/${roleId}`),

    // Applications
    getApplications: (userId: string) =>
        api.get(`/users/${userId}/applications`),
    assignApplication: (userId: string, applicationId: string, membershipType?: string) =>
        api.post(`/users/${userId}/applications`, { applicationId, membershipType }),
    removeApplication: (userId: string, applicationId: string) =>
        api.delete(`/users/${userId}/applications/${applicationId}`),

    // Policies
    getPolicies: (userId: string) =>
        api.get(`/users/${userId}/policies`),
    assignPolicy: (userId: string, policyId: string) =>
        api.post('/user-policies', { userId, policyId }),
    removePolicy: (userId: string, policyId: string) =>
        api.delete(`/user-policies/${userId}/${policyId}`),
};

// ── Roles ──────────────────────────────────────────────────────────────────────

export const rolesApi = {
    list: (applicationId?: string, limit = 500) =>
        api.get('/roles', { params: { limit, ...(applicationId ? { applicationId } : {}) } }),
    getById: (id: string) =>
        api.get(`/roles/${id}`),
    create: (data: { name: string; description?: string; applicationId: string; type?: string; weight?: number }) =>
        api.post('/roles', data),
    update: (id: string, data: { name?: string; description?: string; weight?: number }) =>
        api.patch(`/roles/${id}`, data),
    deactivate: (id: string) =>
        api.delete(`/roles/${id}`),
    reactivate: (id: string) =>
        api.post(`/roles/${id}/reactivate`),
    hardDelete: (id: string) =>
        api.delete(`/roles/${id}/permanent`),

    // Permissions
    getPermissions: (roleId: string) =>
        api.get(`/roles/${roleId}/permissions`),
    addPermission: (roleId: string, permissionId: string, effect?: string) =>
        api.post(`/roles/${roleId}/permissions`, { permissionId, effect: effect || 'allow' }),
    removePermission: (roleId: string, permissionId: string) =>
        api.delete(`/roles/${roleId}/permissions/${permissionId}`),
};

// ── Permissions ────────────────────────────────────────────────────────────────

export const permissionsApi = {
    list: (params?: { resource?: string; category?: string; searchTerm?: string; isActive?: boolean; applicationId?: string; limit?: number; page?: number }) =>
        api.get('/permissions', { params }),
    getById: (id: string) =>
        api.get(`/permissions/${id}`),
    create: (data: { resource: string; action: string; description?: string; category?: string; weight?: number; createdBy?: string }) =>
        api.post('/permissions', data),
    update: (id: string, data: { description?: string; category?: string; weight?: number; updatedBy?: string }) =>
        api.patch(`/permissions/${id}`, data),
    deactivate: (id: string, deletedBy?: string) =>
        api.delete(`/permissions/${id}`, { data: { deletedBy } }),
    reactivate: (id: string, updatedBy?: string) =>
        api.post(`/permissions/${id}/reactivate`, { updatedBy }),
    hardDelete: (id: string) =>
        api.delete(`/permissions/${id}/permanent`),
};

// ── Applications ───────────────────────────────────────────────────────────────

export const applicationsApi = {
    /** Get all applications */
    list: (params?: { isActive?: boolean; environment?: string; page?: number; limit?: number }) =>
        api.get('/applications', { params }),
    /** Create a new application */
    create: (data: { name: string; description?: string; environment?: string; createdBy: string }) =>
        api.post('/applications', data),
    /** Update an application */
    update: (id: string, data: { name?: string; description?: string; environment?: string; ownerApplicationId?: string | null }) =>
        api.patch(`/applications/${id}`, data),
    /** Deactivate an application */
    deactivate: (id: string) =>
        api.delete(`/applications/${id}`),
    /** Reactivate an application */
    reactivate: (id: string) =>
        api.post(`/applications/${id}/reactivate`),
    /** Hard delete an application */
    hardDelete: (id: string) =>
        api.delete(`/applications/${id}/permanent`),
    /** Create a new OAuth application */
    createOAuth: (data: { name: string; description?: string; ownerApplicationId: string; scopes: string[]; tokenDurationDays?: number }) =>
        api.post('/applications/oauth', data),
    /** Create a new M2M service */
    createM2mService: (data: { name: string; description?: string; ownerApplicationId?: string; tokenDurationDays?: number }) =>
        api.post('/applications/m2m-service', data),
    /** Issue a new token for an application */
    issueToken: (id: string, issuedBy?: string, durationDays?: number) =>
        api.post(`/applications/${id}/issue-token`, { issuedBy, ...(durationDays ? { durationDays } : {}) }),
    /** Update the scopes of an application */
    updateScopes: (id: string, scopes: string[]) =>
        api.patch(`/applications/${id}/scopes`, { scopes }),
    /** Regenerate the API key of an application */
    regenerateApiKey: (id: string, updatedBy: string) =>
        api.post(`/applications/${id}/regenerate-api-key`, { updatedBy }),
    /** Rotate the secret of an application */
    rotateSecret: (id: string, updatedBy: string) =>
        api.post(`/applications/${id}/rotate-secret`, { updatedBy }),
};

// ── Audit ──────────────────────────────────────────────────────────────────────

export const auditApi = {
    getStats: (applicationId?: string) =>
        api.get('/audit/stats', { params: applicationId ? { applicationId } : {} }),
    getRecent: (limit = 20, applicationId?: string) =>
        api.get('/audit/recent', { params: applicationId ? { limit, applicationId } : { limit } }),
};

// ── Policies ───────────────────────────────────────────────────────────────────

export const policiesApi = {
    list: (applicationId?: string) =>
        api.get('/policies', { params: applicationId ? { applicationId } : {} }),
    getById: (id: string) =>
        api.get(`/policies/${id}`),
    create: (data: { name: string; description?: string; applicationId: string; type?: string; priority?: number; effect?: string }) =>
        api.post('/policies', data),
    update: (id: string, data: Record<string, any>) =>
        api.put(`/policies/${id}`, data),
    deactivate: (id: string, deletedBy?: string) =>
        api.delete(`/policies/${id}`, { data: { deletedBy } }),
    reactivate: (id: string, reactivatedBy?: string) =>
        api.post(`/policies/${id}/reactivate`, { reactivatedBy }),

    // Rules
    getRules: (policyId: string) =>
        api.get(`/policies/${policyId}/rules`),
    addRule: (policyId: string, data: Record<string, any>) =>
        api.post(`/policies/${policyId}/rules`, data),
    deleteRule: (ruleId: string, deletedBy?: string) =>
        api.delete(`/policies/rules/${ruleId}`, { data: { deletedBy } }),

    // Permissions
    getPermissions: (policyId: string) =>
        api.get(`/policies/${policyId}/permissions`),
    addPermission: (policyId: string, permissionId: string, createdBy?: string) =>
        api.post(`/policies/${policyId}/permissions/${permissionId}`, { createdBy }),
    removePermission: (policyId: string, permissionId: string) =>
        api.delete(`/policies/${policyId}/permissions/${permissionId}`),
};
