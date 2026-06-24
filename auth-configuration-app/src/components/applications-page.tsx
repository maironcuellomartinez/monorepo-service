import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Alert, AlertDescription } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs"
import { applicationsApi, permissionsApi, rolesApi, authApi } from "../lib/api"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { useAuth } from "../contexts/auth-context"
import { Checkbox } from "./ui/checkbox"
import { ScrollArea } from "./ui/scroll-area"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "./ui/command"
import { Plus, RotateCw, Copy, Eye, EyeOff, Pencil, Trash2, Key, X, RefreshCw, Shield, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react"

interface Application {
    id: string; name: string; description: string; apiKey: string | null
    clientId: string | null; type: string; environment: string
    status: string; isActive: boolean; ownerId: string
    scopes: string[] | null; usageCount: number; usageLimit: number
    tokenDurationDays: number; createdAt: string
    ownerApplicationId: string | null
    settings: Record<string, any> | null
}

interface Credentials { label: string; id: string; secret: string }
interface IssuedToken { applicationName: string; token: string; expiresAt: string }
interface Permission { id: string; resource: string; action: string; description: string; category: string }
interface Role { id: string; name: string; description: string; type: string; weight: number; isActive?: boolean }
interface RolePerm { id: string; effect: string; permission: { id: string; resource: string; action: string } }

export function ApplicationsPage() {
    const { user } = useAuth()
    const [apps, setApps] = useState<Application[]>([])
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")

    // Create internal
    const [createOpen, setCreateOpen] = useState(false)
    const [newAppName, setNewAppName] = useState("")
    const [newAppDesc, setNewAppDesc] = useState("")

    // Create OAuth
    const [oauthOpen, setOauthOpen] = useState(false)
    const [oauthName, setOauthName] = useState("")
    const [oauthDesc, setOauthDesc] = useState("")
    const [oauthOwner, setOauthOwner] = useState("")
    const [oauthSelectedScopes, setOauthSelectedScopes] = useState<string[]>([])
    const [oauthScopeSearch, setOauthScopeSearch] = useState("")

    // Edit (shared — campos comunes)
    const [editOpen, setEditOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<Application | null>(null)
    const [editName, setEditName] = useState("")
    const [editDesc, setEditDesc] = useState("")
    const [editEnv, setEditEnv] = useState("")
    const [editOwnerAppId, setEditOwnerAppId] = useState<string>("")
    const [editSelectedScopes, setEditSelectedScopes] = useState<string[]>([])
    const [editScopeSearch, setEditScopeSearch] = useState("")

    // Deactivate confirm
    const [deactivateOpen, setDeactivateOpen] = useState(false)
    const [deactivateTarget, setDeactivateTarget] = useState<Application | null>(null)

    // Hard delete confirm
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<Application | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState("")

    // Permisos disponibles para el picker de scopes
    const [availablePermissions, setAvailablePermissions] = useState<Permission[]>([])

    // Detail: roles & permisos de una app
    const [detailOpen, setDetailOpen] = useState(false)
    const [detailApp, setDetailApp] = useState<Application | null>(null)
    const [detailRoles, setDetailRoles] = useState<Role[]>([])
    const [detailRolesLoading, setDetailRolesLoading] = useState(false)
    const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null)
    const [expandedPerms, setExpandedPerms] = useState<Record<string, RolePerm[]>>({})
    // Agregar permiso a un rol desde el detail
    const [addPermRoleId, setAddPermRoleId] = useState<string | null>(null)
    const [addPermSearch, setAddPermSearch] = useState("")
    const [addPermSelected, setAddPermSelected] = useState("")
    const [addPermEffect, setAddPermEffect] = useState("allow")
    const [addPermAllPerms, setAddPermAllPerms] = useState<Permission[]>([])
    // Crear rol desde el detail
    const [createRoleOpen, setCreateRoleOpen] = useState(false)
    const [newRoleName, setNewRoleName] = useState("")
    const [newRoleDesc, setNewRoleDesc] = useState("")
    const [newRoleWeight, setNewRoleWeight] = useState("0")

    // Rotate secret confirm dialog
    const [rotateOpen, setRotateOpen] = useState(false)
    const [rotateTarget, setRotateTarget] = useState<Application | null>(null)

    // Create M2M service
    const [m2mOpen, setM2mOpen] = useState(false)
    const [m2mName, setM2mName] = useState("")
    const [m2mDesc, setM2mDesc] = useState("")
    const [m2mDays, setM2mDays] = useState("365")
    const [m2mOwnerAppId, setM2mOwnerAppId] = useState("")

    // Credentials one-time reveal
    const [credentials, setCredentials] = useState<Credentials | null>(null)
    const [showSecret, setShowSecret] = useState(false)

    // M2M token one-time reveal
    const [issuedToken, setIssuedToken] = useState<IssuedToken | null>(null)
    const [showToken, setShowToken] = useState(false)

    // Issue token dialog
    const [issueOpen, setIssueOpen] = useState(false)
    const [issueTarget, setIssueTarget] = useState<Application | null>(null)
    const [issueDays, setIssueDays] = useState("")
    const [issuing, setIssuing] = useState(false)

    // Ed25519 public key (JWKS)
    const [ed25519PublicKey, setEd25519PublicKey] = useState<string | null>(null)
    const [ed25519Kid, setEd25519Kid] = useState<string>("abac-m2m-v1")

    // Generar keypair Ed25519
    const [keypairOpen, setKeypairOpen] = useState(false)
    const [generatingKeypair, setGeneratingKeypair] = useState(false)
    const [newKeypair, setNewKeypair] = useState<{ publicKey: string; privateKey: string; kid: string; envVars: { abac: string; verifiers: string } } | null>(null)
    const [showPrivateKey, setShowPrivateKey] = useState(false)

    const loadApps = useCallback(async () => {
        setLoading(true)
        try {
            const { data } = await applicationsApi.list()
            setApps(Array.isArray(data) ? data : data.applications || [])
        } catch {
            setError("Error al cargar aplicaciones")
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => { loadApps() }, [loadApps])

    useEffect(() => {
        permissionsApi.list({ isActive: true, limit: 500 } as any)
            .then(({ data }) => setAvailablePermissions(
                (Array.isArray(data) ? data : data.permissions || [])
                    .sort((a: Permission, b: Permission) => `${a.resource}:${a.action}`.localeCompare(`${b.resource}:${b.action}`))
            ))
            .catch(() => { })
    }, [])

    useEffect(() => {
        authApi.getJwks()
            .then(({ data }) => {
                const key = data.keys?.[0]
                if (key?.x) {
                    // Convertir base64url → base64 estándar para el .env
                    let b64 = key.x.replace(/-/g, '+').replace(/_/g, '/')
                    while (b64.length % 4) b64 += '='
                    setEd25519PublicKey(b64)
                    setEd25519Kid(key.kid ?? 'abac-m2m-v1')
                }
            })
            .catch(() => { })
    }, [])

    const showSuccess = (msg: string) => {
        setSuccess(msg); setTimeout(() => setSuccess(""), 4000)
    }

    // ── CREATE INTERNAL ──────────────────────────────────────────────
    const handleCreateApp = async () => {
        if (!newAppName) return
        setSubmitting(true)
        try {
            const { data } = await applicationsApi.create({
                name: newAppName, description: newAppDesc, createdBy: user?.id || 'system',
            })
            setCredentials({ label: "App Interna", id: data.apiKey, secret: data.apiSecret })
            setShowSecret(false)
            showSuccess("Aplicacion creada")
            setCreateOpen(false); setNewAppName(""); setNewAppDesc("")
            loadApps()
        } catch (err: any) { setError(err.response?.data?.message || "Error al crear aplicacion") } finally { setSubmitting(false) }
    }

    // ── CREATE OAUTH ─────────────────────────────────────────────────
    const handleCreateOAuth = async () => {
        if (!oauthName || !oauthOwner) return
        setSubmitting(true)
        try {
            const { data } = await applicationsApi.createOAuth({
                name: oauthName, description: oauthDesc, ownerApplicationId: oauthOwner,
                scopes: oauthSelectedScopes,
            })
            setCredentials({ label: "OAuth Client", id: data.client_id, secret: data.client_secret })
            setShowSecret(false)
            showSuccess("Cliente OAuth registrado")
            setOauthOpen(false); setOauthName(""); setOauthDesc(""); setOauthOwner("")
            setOauthSelectedScopes([]); setOauthScopeSearch("")
            loadApps()
        } catch (err: any) { setError(err.response?.data?.message || "Error al crear cliente OAuth") } finally { setSubmitting(false) }
    }

    // ── EDIT ─────────────────────────────────────────────────────────
    const openEdit = (app: Application) => {
        setEditTarget(app)
        setEditName(app.name)
        setEditDesc(app.description || "")
        setEditEnv(app.environment || "")
        setEditOwnerAppId(app.ownerApplicationId ?? "")
        setEditSelectedScopes(app.scopes || [])
        setEditScopeSearch("")
        setEditOpen(true)
    }

    const handleEdit = async () => {
        if (!editTarget) return
        setSubmitting(true)
        try {
            await applicationsApi.update(editTarget.id, {
                name: editName,
                description: editDesc,
                environment: editEnv,
                ...(editTarget.type === 'm2m_service' && {
                    ownerApplicationId: editOwnerAppId || null,
                }),
            })
            // Si es OAuth y cambiaron los scopes, actualizar por separado
            if (editTarget.type === 'oauth_client') {
                try {
                    await applicationsApi.updateScopes(editTarget.id, editSelectedScopes)
                } catch {
                    setError("Datos actualizados, pero falló la actualización de scopes")
                }
            }
            // Update optimista: refleja el cambio de inmediato sin esperar la recarga
            setApps(prev => prev.map(a =>
                a.id === editTarget.id
                    ? {
                        ...a,
                        name: editName,
                        description: editDesc,
                        ...(editTarget.type !== 'm2m_service' && { environment: editEnv }),
                        ...(editTarget.type === 'm2m_service' && { ownerApplicationId: editOwnerAppId || null }),
                        ...(editTarget.type === 'oauth_client' && { scopes: editSelectedScopes }),
                    }
                    : a
            ))
            setEditOpen(false)
            showSuccess("Aplicacion actualizada")
            await loadApps() // recarga de confirmación
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al actualizar")
            await loadApps()
        } finally {
            setSubmitting(false)
        }
    }

    // ── DEACTIVATE ───────────────────────────────────────────────────
    const openDeactivate = (app: Application) => {
        setDeactivateTarget(app)
        setDeactivateOpen(true)
    }

    const handleDeactivate = async () => {
        if (!deactivateTarget) return
        try {
            await applicationsApi.deactivate(deactivateTarget.id)
            showSuccess("Aplicacion desactivada")
            setDeactivateOpen(false)
            loadApps()
        } catch (err: any) { setError(err.response?.data?.message || "Error al desactivar") }
    }

    const handleReactivate = async (app: Application) => {
        try {
            await applicationsApi.reactivate(app.id)
            showSuccess(`${app.name} reactivada`)
            loadApps()
        } catch (err: any) { setError(err.response?.data?.message || "Error al reactivar") }
    }

    const openDelete = (app: Application) => {
        setDeleteTarget(app)
        setDeleteConfirm("")
        setDeleteOpen(true)
    }

    const handleDelete = async () => {
        if (!deleteTarget || deleteConfirm !== deleteTarget.name) return
        try {
            await applicationsApi.hardDelete(deleteTarget.id)
            showSuccess("Aplicacion eliminada permanentemente")
            setDeleteOpen(false)
            loadApps()
        } catch (err: any) { setError(err.response?.data?.message || "Error al eliminar") }
    }

    // ── CREATE M2M SERVICE ───────────────────────────────────────────
    const handleCreateM2m = async () => {
        if (!m2mName) return
        setSubmitting(true)
        try {
            await applicationsApi.createM2mService({
                name: m2mName, description: m2mDesc,
                tokenDurationDays: parseInt(m2mDays) || 365,
                ...(m2mOwnerAppId ? { ownerApplicationId: m2mOwnerAppId } : {}),
            })
            showSuccess("Servicio M2M registrado")
            setM2mOpen(false); setM2mName(""); setM2mDesc(""); setM2mDays("365"); setM2mOwnerAppId("")
            loadApps()
        } catch (err: any) { setError(err.response?.data?.message || "Error al registrar servicio M2M") } finally { setSubmitting(false) }
    }

    // ── ISSUE M2M TOKEN ──────────────────────────────────────────────
    const openIssueToken = (app: Application) => {
        setIssueTarget(app)
        setIssueDays(String(app.tokenDurationDays ?? 365))
        setIssueOpen(true)
    }

    const handleIssueToken = async () => {
        if (!issueTarget) return
        setIssuing(true)
        try {
            const days = parseInt(issueDays)
            const durationDays = !isNaN(days) && days > 0 ? days : undefined
            const { data } = await applicationsApi.issueToken(issueTarget.id, user?.id, durationDays)
            setIssuedToken({ applicationName: data.applicationName, token: data.token, expiresAt: data.expiresAt })
            setShowToken(false)
            setIssueOpen(false)
            showSuccess("JWT emitido — copialo al .env del servicio")
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al emitir token")
        } finally {
            setIssuing(false)
        }
    }

    // ── ROTATE SECRET ────────────────────────────────────────────────
    const openRotateSecret = (app: Application) => {
        setRotateTarget(app)
        setRotateOpen(true)
    }

    const confirmRotateSecret = async () => {
        if (!rotateTarget) return
        try {
            const { data } = await applicationsApi.rotateSecret(rotateTarget.id, user?.id || 'system')
            setCredentials({ label: "Nuevo secret", id: data.client_id, secret: data.client_secret })
            setShowSecret(false)
            setRotateOpen(false)
            showSuccess("Secret rotado")
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al rotar secret")
            setRotateOpen(false)
        }
    }

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text); showSuccess("Copiado al portapapeles")
    }

    const handleGenerateKeypair = async () => {
        setGeneratingKeypair(true)
        try {
            const { data } = await authApi.generateKeypair()
            setNewKeypair(data)
            setShowPrivateKey(false)
            // Recargar JWKS para mostrar la nueva clave pública
            authApi.getJwks()
                .then(({ data: jwks }) => {
                    const key = jwks.keys?.[0]
                    if (key?.x) {
                        let b64 = key.x.replace(/-/g, '+').replace(/_/g, '/')
                        while (b64.length % 4) b64 += '='
                        setEd25519PublicKey(b64)
                        setEd25519Kid(key.kid ?? 'abac-m2m-v1')
                    }
                })
                .catch(() => { })
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al generar keypair")
            setKeypairOpen(false)
        } finally {
            setGeneratingKeypair(false)
        }
    }

    const internalApps = apps.filter(a => a.type === 'internal')
    const oauthClients = apps.filter(a => a.type === 'oauth_client')
    const m2mServices = apps.filter(a => a.type === 'm2m_service')

    // ── DETAIL handlers ──────────────────────────────────────────────
    const openDetail = async (app: Application) => {
        setDetailApp(app)
        setExpandedRoleId(null)
        setExpandedPerms({})
        setDetailRoles([])
        setDetailOpen(true)
        setDetailRolesLoading(true)
        try {
            const { data } = await rolesApi.list(app.id)
            setDetailRoles(Array.isArray(data) ? data : data.roles || [])
        } catch { setDetailRoles([]) }
        finally { setDetailRolesLoading(false) }
    }

    const toggleRole = async (role: Role) => {
        if (expandedRoleId === role.id) { setExpandedRoleId(null); return }
        setExpandedRoleId(role.id)
        if (expandedPerms[role.id]) return
        try {
            const { data } = await rolesApi.getById(role.id)
            setExpandedPerms(prev => ({ ...prev, [role.id]: data.permissions || [] }))
        } catch { setExpandedPerms(prev => ({ ...prev, [role.id]: [] })) }
    }

    const openAddPerm = async (roleId: string) => {
        setAddPermRoleId(roleId)
        setAddPermSelected("")
        setAddPermSearch("")
        setAddPermEffect("allow")
        if (addPermAllPerms.length === 0) {
            const { data } = await permissionsApi.list({ limit: 500 } as any)
            setAddPermAllPerms(Array.isArray(data) ? data : data.permissions || [])
        }
    }

    const handleAddPermToRole = async () => {
        if (!addPermRoleId || !addPermSelected) return
        try {
            await rolesApi.addPermission(addPermRoleId, addPermSelected, addPermEffect)
            showSuccess("Permiso asignado")
            const { data } = await rolesApi.getById(addPermRoleId)
            setExpandedPerms(prev => ({ ...prev, [addPermRoleId]: data.permissions || [] }))


            setAddPermRoleId(null)
        } catch (err: any) { setError(err.response?.data?.message || "Error al asignar permiso") }
    }

    const handleRemovePermFromRole = async (roleId: string, permissionId: string) => {
        try {
            await rolesApi.removePermission(roleId, permissionId)
            setExpandedPerms(prev => ({
                ...prev,
                [roleId]: (prev[roleId] || []).filter(rp => rp.permission?.id !== permissionId)
            }))
            showSuccess("Permiso removido")
        } catch (err: any) { setError(err.response?.data?.message || "Error al remover permiso") }
    }

    const handleCreateRoleInDetail = async () => {
        if (!detailApp || !newRoleName) return
        try {
            await rolesApi.create({ name: newRoleName, description: newRoleDesc, applicationId: detailApp.id, type: 'custom', weight: parseInt(newRoleWeight) || 0 })
            showSuccess("Rol creado")
            setCreateRoleOpen(false)
            setNewRoleName(""); setNewRoleDesc(""); setNewRoleWeight("0")
            const { data } = await rolesApi.list(detailApp.id)
            setDetailRoles(Array.isArray(data) ? data : data.roles || [])
        } catch (err: any) { setError(err.response?.data?.message || "Error al crear rol") }
    }

    // ── RENDER ───────────────────────────────────────────────────────
    return (
        <div className="space-y-6">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}

            {/* One-time credentials banner */}
            {credentials && (
                <Card className="border-yellow-400 bg-yellow-50 dark:bg-yellow-950/20">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-yellow-700 dark:text-yellow-400 text-base">
                            Credenciales generadas — {credentials.label}
                        </CardTitle>
                        <CardDescription>
                            Guarda estas credenciales ahora. El secret no se puede recuperar despues de cerrar este mensaje.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Label className="w-28 shrink-0 text-xs">ID / API Key</Label>
                            <code className="flex-1 bg-background px-3 py-1.5 rounded text-xs border">{credentials.id}</code>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(credentials.id)}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex items-center gap-2">
                            <Label className="w-28 shrink-0 text-xs">Secret</Label>
                            <code className="flex-1 bg-background px-3 py-1.5 rounded text-xs border">
                                {showSecret ? credentials.secret : '••••••••••••••••••••••••'}
                            </code>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowSecret(s => !s)}>
                                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(credentials.secret)}>
                                <Copy className="h-4 w-4" />
                            </Button>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setCredentials(null)}>Cerrar</Button>
                    </CardContent>
                </Card>
            )}

            {/* M2M token one-time banner */}
            {issuedToken && (
                <Card className="border-blue-400 bg-blue-50 dark:bg-blue-950/20">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-blue-700 dark:text-blue-400 text-base flex items-center gap-2">
                            <Key className="h-4 w-4" />
                            JWT EdDSA emitido — {issuedToken.applicationName}
                        </CardTitle>
                        <CardDescription className="space-y-1">
                            <span className="block">
                                Firmado con <span className="font-semibold">Ed25519 (EdDSA)</span>.
                                Copia este token al <code className="text-xs bg-muted px-1 rounded">.env</code> del servicio como{" "}
                                <code className="text-xs bg-muted px-1 rounded">ABAC_M2M_TOKEN</code> y reinicia el servicio.
                            </span>
                            <span className="block text-xs">
                                Expira: <span className="font-medium">{new Date(issuedToken.expiresAt).toLocaleDateString()}</span>.
                                Re-emite antes de esa fecha o si rotas el keypair Ed25519.
                            </span>
                            <span className="block text-xs text-orange-600 dark:text-orange-400 font-medium">
                                No se puede recuperar después de cerrar este mensaje.
                            </span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex items-start gap-2">
                            <Label className="w-28 shrink-0 text-xs pt-2">ABAC_M2M_TOKEN</Label>
                            <code className="flex-1 bg-background px-3 py-2 rounded text-xs border break-all leading-relaxed font-mono">
                                {showToken ? issuedToken.token : `${issuedToken.token.substring(0, 40)}…`}
                            </code>
                            <div className="flex flex-col gap-1">
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowToken(s => !s)}>
                                    {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </Button>
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyToClipboard(issuedToken.token)}>
                                    <Copy className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setIssuedToken(null)}>Cerrar</Button>
                    </CardContent>
                </Card>
            )}

            <Tabs defaultValue="internal">
                <TabsList className="mb-4">
                    <TabsTrigger value="internal">
                        Apps Nativas <Badge variant="secondary" className="ml-2">{internalApps.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="m2m">
                        Servicios M2M <Badge variant="secondary" className="ml-2">{m2mServices.length}</Badge>
                    </TabsTrigger>
                    <TabsTrigger value="oauth">
                        OAuth Clients <Badge variant="secondary" className="ml-2">{oauthClients.length}</Badge>
                    </TabsTrigger>
                </TabsList>

                {/* ── APPS INTERNAS ── */}
                <TabsContent value="internal">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Apps Nativas</CardTitle>
                                    <CardDescription>Aplicaciones con lógica de negocio propia. Tienen <code className="text-xs bg-muted px-1 rounded">apiKey</code> / <code className="text-xs bg-muted px-1 rounded">apiSecret</code> y los intercambian por un JWT de acceso.</CardDescription>
                                </div>
                                <Button onClick={() => setCreateOpen(true)} size="sm">
                                    <Plus className="h-4 w-4 mr-1" /> Nueva App
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Descripcion</TableHead>
                                        <TableHead>Ambiente</TableHead>
                                        <TableHead>API Key</TableHead>
                                        <TableHead>Uso</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="w-24">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow><TableCell colSpan={7} className="text-center py-8">Cargando...</TableCell></TableRow>
                                    ) : internalApps.length === 0 ? (
                                        <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin aplicaciones internas</TableCell></TableRow>
                                    ) : internalApps.map((app) => (
                                        <TableRow key={app.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-1">
                                                    {app.name}
                                                    <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground" title={`Copiar ID: ${app.id}`} onClick={() => copyToClipboard(app.id)}>
                                                        <Copy className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{app.description || '-'}</TableCell>
                                            <TableCell className="text-sm">{app.environment}</TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                {app.apiKey ? `${app.apiKey.substring(0, 14)}…` : '-'}
                                            </TableCell>
                                            <TableCell className="text-sm">
                                                {app.usageCount || 0}{app.usageLimit ? ` / ${app.usageLimit}` : ''}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={app.isActive ? "text-green-700 border-green-300" : "text-gray-500"}>
                                                    {app.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" title="Roles y permisos" onClick={() => openDetail(app)}>
                                                        <Shield className="h-4 w-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(app)}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    {app.isActive ? (
                                                        <Button variant="ghost" size="icon" title="Desactivar" onClick={() => openDeactivate(app)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    ) : (
                                                        <>
                                                            <Button variant="ghost" size="icon" title="Reactivar" className="text-green-600 hover:text-green-700" onClick={() => handleReactivate(app)}>
                                                                <RefreshCw className="h-4 w-4" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" title="Eliminar permanentemente" className="text-destructive hover:text-destructive" onClick={() => openDelete(app)}>
                                                                <X className="h-4 w-4" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── SERVICIOS M2M ── */}
                <TabsContent value="m2m">
                    {/* Ed25519 public key card */}
                    <Card className="mb-4 border-violet-300 bg-violet-50 dark:bg-violet-950/20">
                        <CardHeader className="pb-2">
                            <div className="flex items-start justify-between">
                                <div>
                                    <CardTitle className="text-violet-700 dark:text-violet-400 text-sm flex items-center gap-2">
                                        <Shield className="h-4 w-4" />
                                        Clave Pública Ed25519 — verificación de tokens M2M
                                    </CardTitle>
                                    <CardDescription className="text-xs mt-1">
                                        Todos los servicios verificadores (api-gateway, monolith, api-snowq) necesitan esta clave en su <code className="bg-muted px-1 rounded">.env</code> como <code className="bg-muted px-1 rounded">ED25519_PUBLIC_KEY</code>.
                                        La clave privada solo existe en ABAC.
                                    </CardDescription>
                                </div>
                                <Button variant="outline" size="sm" className="shrink-0 ml-4 text-violet-700 border-violet-300 hover:bg-violet-100"
                                    onClick={() => { setNewKeypair(null); setKeypairOpen(true) }}>
                                    <RotateCw className="h-3.5 w-3.5 mr-1" /> Generar keypair
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {ed25519PublicKey ? (
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <Label className="text-xs w-36 shrink-0">ED25519_PUBLIC_KEY</Label>
                                        <code className="flex-1 bg-background px-3 py-1.5 rounded text-xs border font-mono break-all">
                                            {ed25519PublicKey}
                                        </code>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Copiar valor"
                                            onClick={() => copyToClipboard(ed25519PublicKey)}>
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Copiar como variable de entorno"
                                            onClick={() => copyToClipboard(`ED25519_PUBLIC_KEY=${ed25519PublicKey}`)}>
                                            <Key className="h-4 w-4" />
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        kid: <code className="bg-muted px-1 rounded">{ed25519Kid}</code> · algoritmo: <code className="bg-muted px-1 rounded">EdDSA</code> · curva: <code className="bg-muted px-1 rounded">Ed25519</code>
                                    </p>
                                </div>
                            ) : (
                                <p className="text-xs text-muted-foreground italic">
                                    No hay clave pública configurada en el servidor — usa "Generar keypair" para crear una o verifica que <code className="bg-muted px-1 rounded">ED25519_PRIVATE_KEY</code> esté en el <code className="bg-muted px-1 rounded">.env</code> de ABAC.
                                </p>
                            )}
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>Servicios de Infraestructura</CardTitle>
                                    <CardDescription>
                                        api-gateway, api-snowq, api-middleware, integration-service — sin apiKey, solo JWT EdDSA en <code className="text-xs bg-muted px-1 rounded">.env</code>
                                    </CardDescription>
                                </div>
                                <Button onClick={() => setM2mOpen(true)} size="sm">
                                    <Plus className="h-4 w-4 mr-1" /> Registrar Servicio
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Descripcion</TableHead>
                                        <TableHead>Ecosistema (App Nativa)</TableHead>
                                        <TableHead className="w-28">Duracion JWT</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="w-32">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando...</TableCell></TableRow>
                                    ) : m2mServices.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin servicios M2M registrados</TableCell></TableRow>
                                    ) : m2mServices.map((app) => (
                                        <TableRow key={app.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-1">
                                                    {app.name}
                                                    <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground" title={`Copiar ID: ${app.id}`} onClick={() => copyToClipboard(app.id)}>
                                                        <Copy className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{app.description || '-'}</TableCell>
                                            <TableCell>
                                                {app.ownerApplicationId
                                                    ? <Badge variant="outline" className="text-xs text-violet-700 border-violet-300 font-normal">
                                                        {internalApps.find(a => a.id === app.ownerApplicationId)?.name ?? `${app.ownerApplicationId.substring(0, 8)}…`}
                                                    </Badge>
                                                    : <Badge variant="secondary" className="text-xs font-normal text-muted-foreground">Global</Badge>}
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {app.tokenDurationDays ?? 365} dias
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={app.isActive ? "text-green-700 border-green-300" : "text-gray-500"}>
                                                    {app.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1">
                                                    {app.isActive && (
                                                        <Button variant="ghost" size="icon" title="Emitir JWT" onClick={() => openIssueToken(app)}>
                                                            <Key className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(app)}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    {app.isActive ? (
                                                        <Button variant="ghost" size="icon" title="Desactivar" onClick={() => openDeactivate(app)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    ) : (
                                                        <>
                                                            <Button variant="ghost" size="icon" title="Reactivar" className="text-green-600 hover:text-green-700" onClick={() => handleReactivate(app)}>
                                                                <RefreshCw className="h-4 w-4" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" title="Eliminar permanentemente" className="text-destructive hover:text-destructive" onClick={() => openDelete(app)}>
                                                                <X className="h-4 w-4" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── OAUTH CLIENTS ── */}
                <TabsContent value="oauth">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <div>
                                    <CardTitle>OAuth 2.0 Clients</CardTitle>
                                    <CardDescription>Apps externas — clientId + clientSecret → POST /auth/oauth/token</CardDescription>
                                </div>
                                <Button onClick={() => setOauthOpen(true)} size="sm">
                                    <Plus className="h-4 w-4 mr-1" /> Registrar Client
                                </Button>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Descripcion</TableHead>
                                        <TableHead>Client ID</TableHead>
                                        <TableHead>Scopes</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="w-32">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow><TableCell colSpan={6} className="text-center py-8">Cargando...</TableCell></TableRow>
                                    ) : oauthClients.length === 0 ? (
                                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin OAuth clients registrados</TableCell></TableRow>
                                    ) : oauthClients.map((app) => (
                                        <TableRow key={app.id}>
                                            <TableCell className="font-medium">
                                                <div className="flex items-center gap-1">
                                                    {app.name}
                                                    <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-foreground" title={`Copiar ID: ${app.id}`} onClick={() => copyToClipboard(app.id)}>
                                                        <Copy className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-sm text-muted-foreground">{app.description || '-'}</TableCell>
                                            <TableCell className="font-mono text-xs text-muted-foreground">
                                                {app.clientId ? `${app.clientId.substring(0, 14)}…` : '-'}
                                            </TableCell>
                                            <TableCell>
                                                {app.scopes?.length ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {app.scopes.map(s => (
                                                            <Badge key={s} variant="secondary" className="text-xs font-mono">{s}</Badge>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-muted-foreground">todos los permisos del owner</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="outline" className={app.isActive ? "text-green-700 border-green-300" : "text-gray-500"}>
                                                    {app.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex gap-1">
                                                    <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(app)}>
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    {app.isActive && (
                                                        <Button variant="ghost" size="icon" title="Rotar secret" onClick={() => openRotateSecret(app)}>
                                                            <RotateCw className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    {app.isActive ? (
                                                        <Button variant="ghost" size="icon" title="Desactivar" onClick={() => openDeactivate(app)}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    ) : (
                                                        <>
                                                            <Button variant="ghost" size="icon" title="Reactivar" className="text-green-600 hover:text-green-700" onClick={() => handleReactivate(app)}>
                                                                <RefreshCw className="h-4 w-4" />
                                                            </Button>
                                                            <Button variant="ghost" size="icon" title="Eliminar permanentemente" className="text-destructive hover:text-destructive" onClick={() => openDelete(app)}>
                                                                <X className="h-4 w-4" />
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Dialog: Nueva App Interna */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Nueva aplicacion interna</DialogTitle></DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Genera <code className="text-xs bg-muted px-1 rounded">apiKey</code> y <code className="text-xs bg-muted px-1 rounded">apiSecret</code>. El servicio los presenta al ABAC para obtener un JWT de acceso a los recursos.
                    </p>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Nombre</Label>
                            <Input value={newAppName} onChange={(e) => setNewAppName(e.target.value)} placeholder="api-gateway, monolith..." />
                        </div>
                        <div className="space-y-2">
                            <Label>Descripcion</Label>
                            <Input value={newAppDesc} onChange={(e) => setNewAppDesc(e.target.value)} placeholder="Descripcion opcional" />
                        </div>
                        <Button onClick={handleCreateApp} className="w-full" disabled={!newAppName || submitting}>{submitting ? "Creando..." : "Crear"}</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog: Registrar OAuth Client */}
            <Dialog open={oauthOpen} onOpenChange={setOauthOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Registrar cliente OAuth 2.0</DialogTitle></DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Genera <code className="text-xs bg-muted px-1 rounded">client_id</code> y <code className="text-xs bg-muted px-1 rounded">client_secret</code> para apps externas (RFC 6749).
                    </p>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Nombre</Label>
                            <Input value={oauthName} onChange={(e) => setOauthName(e.target.value)} placeholder="partner-portal, reporting-app..." />
                        </div>
                        <div className="space-y-2">
                            <Label>Descripcion</Label>
                            <Input value={oauthDesc} onChange={(e) => setOauthDesc(e.target.value)} placeholder="Descripcion opcional" />
                        </div>
                        <div className="space-y-2">
                            <Label>App Nativa (owner)</Label>
                            <Select value={oauthOwner} onValueChange={setOauthOwner}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar app nativa..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {apps.filter(a => a.type === 'internal' && a.isActive).map(a => (
                                        <SelectItem key={a.id} value={a.id}>
                                            {a.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Los scopes serán subconjunto de los permisos de esta app.</p>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Scopes permitidos</Label>
                                {oauthSelectedScopes.length > 0 && (
                                    <span className="text-xs text-muted-foreground">{oauthSelectedScopes.length} seleccionados</span>
                                )}
                            </div>
                            <Input
                                placeholder="Buscar permiso..."
                                value={oauthScopeSearch}
                                onChange={(e) => setOauthScopeSearch(e.target.value)}
                                className="h-8 text-xs"
                            />
                            <ScrollArea className="h-44 rounded-md border px-2 py-1">
                                {availablePermissions
                                    .filter(p => `${p.resource}:${p.action}`.includes(oauthScopeSearch.toLowerCase()) || p.description?.toLowerCase().includes(oauthScopeSearch.toLowerCase()))
                                    .map(p => {
                                        const key = `${p.resource}:${p.action}`
                                        return (
                                            <div key={p.id} className="flex items-center gap-2 py-1">
                                                <Checkbox
                                                    id={`oauth-perm-${p.id}`}
                                                    checked={oauthSelectedScopes.includes(key)}
                                                    onCheckedChange={(checked) =>
                                                        setOauthSelectedScopes(prev =>
                                                            checked ? [...prev, key] : prev.filter(s => s !== key)
                                                        )
                                                    }
                                                />
                                                <label htmlFor={`oauth-perm-${p.id}`} className="text-xs font-mono cursor-pointer select-none">
                                                    {key}
                                                </label>
                                            </div>
                                        )
                                    })
                                }
                            </ScrollArea>
                            <p className="text-xs text-muted-foreground">Sin seleccion = todos los permisos del owner.</p>
                        </div>
                        <Button onClick={handleCreateOAuth} className="w-full" disabled={!oauthName || !oauthOwner || submitting}>{submitting ? "Registrando..." : "Registrar"}</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog: Eliminar permanentemente */}
            <Dialog open={deleteOpen} onOpenChange={(o) => { setDeleteOpen(o); if (!o) setDeleteConfirm("") }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-destructive">Eliminar aplicacion permanentemente</DialogTitle>
                    </DialogHeader>
                    {deleteTarget && (
                        <div className="space-y-4">
                            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 space-y-1">
                                <p className="font-medium text-sm">{deleteTarget.name}</p>
                                {deleteTarget.description && (
                                    <p className="text-xs text-muted-foreground">{deleteTarget.description}</p>
                                )}
                                <p className="text-xs font-mono text-muted-foreground">tipo: {deleteTarget.type}</p>
                            </div>
                            <div className="space-y-2 text-sm text-muted-foreground">
                                <p>Esta accion <span className="font-semibold text-foreground">no se puede deshacer</span>. Se eliminaran:</p>
                                <ul className="list-disc list-inside space-y-1 text-xs">
                                    <li>La aplicacion y todas sus credenciales</li>
                                    <li>Roles y permisos asociados a esta aplicacion</li>
                                    <li>Asignaciones de usuarios a esta aplicacion</li>
                                    <li>Politicas definidas para esta aplicacion</li>
                                </ul>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm">
                                    Escribe <span className="font-mono font-semibold">{deleteTarget.name}</span> para confirmar
                                </Label>
                                <Input
                                    value={deleteConfirm}
                                    onChange={(e) => setDeleteConfirm(e.target.value)}
                                    placeholder={deleteTarget.name}
                                    className="border-destructive/50 focus-visible:ring-destructive"
                                />
                            </div>
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleteConfirm("") }}>
                                    Cancelar
                                </Button>
                                <Button
                                    variant="destructive"
                                    onClick={handleDelete}
                                    disabled={deleteConfirm !== deleteTarget.name}
                                >
                                    Eliminar permanentemente
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Dialog: Confirmar rotacion de secret */}
            <Dialog open={rotateOpen} onOpenChange={setRotateOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Rotar secret</DialogTitle></DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        El secret anterior de <span className="font-semibold">{rotateTarget?.name}</span> dejará de funcionar inmediatamente.
                        Esta acción no se puede deshacer.
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setRotateOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={confirmRotateSecret}>Rotar secret</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog: Registrar Servicio M2M */}
            <Dialog open={m2mOpen} onOpenChange={setM2mOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Registrar servicio M2M</DialogTitle></DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Servicio de infraestructura sin <code className="text-xs bg-muted px-1 rounded">apiKey</code>.
                        Usa un JWT de larga duración en su <code className="text-xs bg-muted px-1 rounded">.env</code>.
                    </p>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Nombre</Label>
                            <Input value={m2mName} onChange={(e) => setM2mName(e.target.value)} placeholder="api-gateway, api-snowq-service..." />
                        </div>
                        <div className="space-y-2">
                            <Label>Descripcion</Label>
                            <Input value={m2mDesc} onChange={(e) => setM2mDesc(e.target.value)} placeholder="Descripcion opcional" />
                        </div>
                        <div className="space-y-2">
                            <Label>Ecosistema — App Nativa <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                            <Select value={m2mOwnerAppId} onValueChange={setM2mOwnerAppId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Sin ecosistema (servicio global)" />
                                </SelectTrigger>
                                <SelectContent>
                                    {internalApps.filter(a => a.isActive).map(a => (
                                        <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Servicios del mismo ecosistema solo pueden llamarse entre sí — el receptor rechaza tokens de otros ecosistemas.
                                <span className="font-medium text-foreground"> Sin ecosistema</span> = servicio global, puede llamar y ser llamado desde cualquier ecosistema.
                            </p>
                        </div>
                        <p className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded">
                            La identidad del servicio es su <code>applicationId</code> (UUID). No se crea ningún usuario ni rol — el control de acceso se gestiona únicamente por ecosistema.
                        </p>
                        <div className="space-y-2">
                            <Label>Duracion del JWT (dias)</Label>
                            <Input type="number" value={m2mDays} onChange={(e) => setM2mDays(e.target.value)} />
                            <p className="text-xs text-muted-foreground">Default 365. Cuanto dura el token antes de que el admin deba emitir uno nuevo.</p>
                        </div>
                        <Button onClick={handleCreateM2m} className="w-full" disabled={!m2mName || submitting}>{submitting ? "Registrando..." : "Registrar"}</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog: Confirmar desactivacion */}
            <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Desactivar aplicacion</DialogTitle>
                    </DialogHeader>
                    {deactivateTarget && (
                        <div className="space-y-4">
                            <div className="rounded-md border border-destructive/40 bg-destructive/5 px-4 py-3 space-y-1">
                                <p className="font-medium text-sm">{deactivateTarget.name}</p>
                                {deactivateTarget.description && (
                                    <p className="text-xs text-muted-foreground">{deactivateTarget.description}</p>
                                )}
                                <p className="text-xs text-muted-foreground">
                                    Tipo: <span className="font-mono">{deactivateTarget.type}</span>
                                </p>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                Las credenciales de esta aplicacion dejaran de funcionar de inmediato.
                                Esta accion no se puede deshacer desde el dashboard.
                            </p>
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setDeactivateOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button variant="destructive" onClick={handleDeactivate}>
                                    Desactivar
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Dialog: Roles & Permisos de la app */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Shield className="h-4 w-4" />
                            Roles y permisos — {detailApp?.name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-muted-foreground">
                                {detailRoles.length} rol{detailRoles.length !== 1 ? 'es' : ''} en esta aplicacion
                            </p>
                            <Button size="sm" variant="outline" onClick={() => setCreateRoleOpen(true)}>
                                <Plus className="h-4 w-4 mr-1" /> Crear rol
                            </Button>
                        </div>

                        {detailRolesLoading ? (
                            <p className="text-sm text-muted-foreground text-center py-6">Cargando roles...</p>
                        ) : detailRoles.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-6">Sin roles. Crea uno para asignar permisos.</p>
                        ) : detailRoles.map(role => (
                            <div key={role.id} className="border rounded-md overflow-hidden">
                                <button
                                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
                                    onClick={() => toggleRole(role)}
                                >
                                    <div className="flex items-center gap-3">
                                        {expandedRoleId === role.id ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                                        <span className="font-medium text-sm">{role.name}</span>
                                        <span className={`px-1.5 py-0.5 rounded text-xs ${role.type === 'system' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>{role.type}</span>
                                    </div>
                                    <span className="text-xs text-muted-foreground">{expandedPerms[role.id]?.length ?? '—'} permisos</span>
                                </button>

                                {expandedRoleId === role.id && (
                                    <div className="border-t px-4 py-3 space-y-2 bg-muted/20">
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs text-muted-foreground">{role.description || 'Sin descripcion'}</span>
                                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => openAddPerm(role.id)}>
                                                <Plus className="h-3 w-3 mr-1" /> Agregar permiso
                                            </Button>
                                        </div>

                                        {/* Add permission inline */}
                                        {addPermRoleId === role.id && (
                                            <div className="bg-background border rounded overflow-hidden space-y-0">
                                                <Command className="rounded-none">
                                                    <CommandInput placeholder="Buscar permiso..." className="h-8 text-xs" />
                                                    <CommandList className="max-h-36">
                                                        <CommandEmpty className="py-3 text-xs">Sin resultados</CommandEmpty>
                                                        <CommandGroup>
                                                            {addPermAllPerms
                                                                .filter(p => !(expandedPerms[role.id] || []).some(rp => rp.permission?.id === p.id))
                                                                .map(p => (
                                                                    <CommandItem
                                                                        key={p.id}
                                                                        value={`${p.resource}:${p.action}`}
                                                                        onSelect={() => setAddPermSelected(p.id)}
                                                                        className={`font-mono text-xs cursor-pointer ${addPermSelected === p.id ? 'bg-primary/10 text-primary' : ''}`}
                                                                    >
                                                                        {p.resource}:{p.action}
                                                                    </CommandItem>
                                                                ))
                                                            }
                                                        </CommandGroup>
                                                    </CommandList>
                                                </Command>
                                                <div className="flex gap-2 items-center p-2 border-t">
                                                    <Select value={addPermEffect} onValueChange={setAddPermEffect}>
                                                        <SelectTrigger className="h-7 text-xs w-24">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="allow">allow</SelectItem>
                                                            <SelectItem value="deny">deny</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                    <Button size="sm" className="h-7 text-xs flex-1" disabled={!addPermSelected} onClick={handleAddPermToRole}>
                                                        {addPermSelected
                                                            ? `Asignar — ${addPermAllPerms.find(p => p.id === addPermSelected)?.resource}:${addPermAllPerms.find(p => p.id === addPermSelected)?.action}`
                                                            : 'Selecciona un permiso'}
                                                    </Button>
                                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setAddPermRoleId(null)}>
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Permission list */}
                                        {!expandedPerms[role.id] ? (
                                            <p className="text-xs text-muted-foreground text-center py-2">Cargando...</p>
                                        ) : expandedPerms[role.id].length === 0 ? (
                                            <p className="text-xs text-muted-foreground text-center py-2">Sin permisos asignados</p>
                                        ) : (
                                            <div className="grid gap-1">
                                                {expandedPerms[role.id].map(rp => (
                                                    <div key={rp.id} className="flex items-center justify-between bg-background rounded px-3 py-1.5 text-xs">
                                                        <span className="font-mono">{rp.permission?.resource}:{rp.permission?.action}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className={`px-1.5 py-0.5 rounded ${rp.effect === 'allow' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                {rp.effect}
                                                            </span>
                                                            <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleRemovePermFromRole(role.id, rp.permission?.id)}>
                                                                <X className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Sub-dialog: crear rol desde el detail */}
            <Dialog open={createRoleOpen} onOpenChange={setCreateRoleOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Crear rol — {detailApp?.name}</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Nombre</Label>
                            <Input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="viewer, editor, admin..." />
                        </div>
                        <div className="space-y-2">
                            <Label>Descripcion</Label>
                            <Input value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Peso</Label>
                            <Input type="number" value={newRoleWeight} onChange={e => setNewRoleWeight(e.target.value)} />
                        </div>
                        <Button onClick={handleCreateRoleInDetail} className="w-full" disabled={!newRoleName}>Crear</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog: Editar (compartido) */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            Editar {editTarget?.type === 'oauth_client' ? 'OAuth Client' : editTarget?.type === 'm2m_service' ? 'Servicio M2M' : 'App Interna'}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Nombre</Label>
                            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Descripcion</Label>
                            <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                        </div>
                        {editTarget?.type === 'internal' && (
                            <div className="space-y-2">
                                <Label>Ambiente</Label>
                                <Input value={editEnv} onChange={(e) => setEditEnv(e.target.value)} placeholder="development, staging, production" />
                            </div>
                        )}
                        {editTarget?.type === 'm2m_service' && (
                            <div className="space-y-2">
                                <Label>Ecosistema — App Nativa <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                                <Select
                                    value={editOwnerAppId || "__global__"}
                                    onValueChange={(v) => setEditOwnerAppId(v === "__global__" ? "" : v)}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__global__">Sin ecosistema (global)</SelectItem>
                                        {internalApps.filter(a => a.isActive).map(a => (
                                            <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                    El cambio de ecosistema requiere re-emitir el JWT para que tenga efecto.
                                </p>
                            </div>
                        )}
                        {editTarget?.type === 'oauth_client' && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label>Scopes permitidos</Label>
                                    {editSelectedScopes.length > 0 && (
                                        <span className="text-xs text-muted-foreground">{editSelectedScopes.length} seleccionados</span>
                                    )}
                                </div>
                                <Input
                                    placeholder="Buscar permiso..."
                                    value={editScopeSearch}
                                    onChange={(e) => setEditScopeSearch(e.target.value)}
                                    className="h-8 text-xs"
                                />
                                <ScrollArea className="h-44 rounded-md border px-2 py-1">
                                    {availablePermissions
                                        .filter(p => `${p.resource}:${p.action}`.includes(editScopeSearch.toLowerCase()) || p.description?.toLowerCase().includes(editScopeSearch.toLowerCase()))
                                        .map(p => {
                                            const key = `${p.resource}:${p.action}`
                                            return (
                                                <div key={p.id} className="flex items-center gap-2 py-1">
                                                    <Checkbox
                                                        id={`edit-perm-${p.id}`}
                                                        checked={editSelectedScopes.includes(key)}
                                                        onCheckedChange={(checked) =>
                                                            setEditSelectedScopes(prev =>
                                                                checked ? [...prev, key] : prev.filter(s => s !== key)
                                                            )
                                                        }
                                                    />
                                                    <label htmlFor={`edit-perm-${p.id}`} className="text-xs font-mono cursor-pointer select-none">
                                                        {key}
                                                    </label>
                                                </div>
                                            )
                                        })
                                    }
                                </ScrollArea>
                                <p className="text-xs text-muted-foreground">Sin seleccion = todos los permisos del owner.</p>
                            </div>
                        )}
                        <Button onClick={handleEdit} className="w-full" disabled={!editName || submitting}>{submitting ? "Guardando..." : "Guardar"}</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog: Emitir JWT M2M */}
            <Dialog open={issueOpen} onOpenChange={setIssueOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Key className="h-4 w-4" />
                            Emitir JWT M2M — {issueTarget?.name}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Duración (días)</Label>
                            <Input
                                type="number"
                                min={1}
                                max={730}
                                value={issueDays}
                                onChange={(e) => setIssueDays(e.target.value)}
                                placeholder="365"
                            />
                            <p className="text-xs text-muted-foreground">
                                Default del servicio: <span className="font-medium">{issueTarget?.tokenDurationDays ?? 365} días</span>.
                                {issueDays && !isNaN(parseInt(issueDays)) && parseInt(issueDays) > 0 && (
                                    <> Expira el <span className="font-medium">
                                        {new Date(Date.now() + parseInt(issueDays) * 86400000).toLocaleDateString()}
                                    </span>.</>
                                )}
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" className="flex-1" onClick={() => setIssueOpen(false)}>Cancelar</Button>
                            <Button className="flex-1" onClick={handleIssueToken} disabled={issuing || !issueDays || isNaN(parseInt(issueDays)) || parseInt(issueDays) < 1}>
                                {issuing ? "Emitiendo..." : "Emitir token"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Dialog: Generar keypair Ed25519 */}
            <Dialog open={keypairOpen} onOpenChange={(o) => { if (!o) { setNewKeypair(null); setShowPrivateKey(false) } setKeypairOpen(o) }}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Shield className="h-5 w-5 text-violet-600" />
                            Generar nuevo keypair Ed25519
                        </DialogTitle>
                    </DialogHeader>

                    {!newKeypair ? (
                        <div className="space-y-4">
                            <Alert className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                <AlertDescription className="text-sm text-amber-800 dark:text-amber-300 space-y-1">
                                    <p className="font-semibold">Esto reemplazará el keypair activo.</p>
                                    <p>Todos los tokens M2M en circulación dejarán de ser válidos inmediatamente. Deberás re-emitir tokens para todos los servicios y actualizar <code className="bg-muted px-1 rounded">ED25519_PUBLIC_KEY</code> en api-gateway, monolith y api-snowq-service antes de reiniciarlos.</p>
                                </AlertDescription>
                            </Alert>
                            <p className="text-sm text-muted-foreground">
                                El nuevo keypair se activa en memoria de inmediato. Para que persista entre reinicios, copia las claves generadas a los archivos <code className="bg-muted px-1 rounded">.env</code> correspondientes.
                            </p>
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setKeypairOpen(false)}>Cancelar</Button>
                                <Button className="bg-violet-600 hover:bg-violet-700" onClick={handleGenerateKeypair} disabled={generatingKeypair}>
                                    {generatingKeypair ? "Generando..." : "Generar keypair"}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <Alert className="border-red-300 bg-red-50 dark:bg-red-950/20">
                                <AlertTriangle className="h-4 w-4 text-red-600" />
                                <AlertDescription className="text-sm text-red-800 dark:text-red-300 font-semibold">
                                    Guarda la clave privada ahora — no se puede recuperar después.
                                </AlertDescription>
                            </Alert>

                            {/* Clave privada */}
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold text-red-700">ED25519_PRIVATE_KEY — solo en ABAC</Label>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowPrivateKey(v => !v)}>
                                        {showPrivateKey ? <EyeOff className="h-3.5 w-3.5 mr-1" /> : <Eye className="h-3.5 w-3.5 mr-1" />}
                                        {showPrivateKey ? "Ocultar" : "Mostrar"}
                                    </Button>
                                </div>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 bg-red-50 dark:bg-red-950/30 border border-red-200 px-3 py-1.5 rounded text-xs font-mono break-all">
                                        {showPrivateKey ? newKeypair.privateKey : '•'.repeat(44)}
                                    </code>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Copiar clave privada"
                                        onClick={() => copyToClipboard(newKeypair.privateKey)}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Copiar como env var"
                                        onClick={() => copyToClipboard(`ED25519_PRIVATE_KEY=${newKeypair.privateKey}`)}>
                                        <Key className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            {/* Clave pública */}
                            <div className="space-y-1">
                                <Label className="text-xs font-semibold text-violet-700">ED25519_PUBLIC_KEY — copiar a todos los servicios verificadores</Label>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 px-3 py-1.5 rounded text-xs font-mono break-all">
                                        {newKeypair.publicKey}
                                    </code>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Copiar clave pública"
                                        onClick={() => copyToClipboard(newKeypair.publicKey)}>
                                        <Copy className="h-4 w-4" />
                                    </Button>
                                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" title="Copiar como env var"
                                        onClick={() => copyToClipboard(`ED25519_PUBLIC_KEY=${newKeypair.publicKey}`)}>
                                        <Key className="h-4 w-4" />
                                    </Button>
                                </div>
                                <p className="text-xs text-muted-foreground">kid: <code className="bg-muted px-1 rounded">{newKeypair.kid}</code></p>
                            </div>

                            {/* Bloque de env para copiar de golpe */}
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold">Bloque completo para .env de ABAC</Label>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs"
                                        onClick={() => copyToClipboard(newKeypair.envVars.abac)}>
                                        <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                                    </Button>
                                </div>
                                <pre className="text-xs bg-muted rounded p-2 font-mono whitespace-pre-wrap break-all">{newKeypair.envVars.abac}</pre>
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-semibold">Para api-gateway / monolith / api-snowq</Label>
                                    <Button variant="ghost" size="sm" className="h-7 text-xs"
                                        onClick={() => copyToClipboard(newKeypair.envVars.verifiers)}>
                                        <Copy className="h-3.5 w-3.5 mr-1" /> Copiar
                                    </Button>
                                </div>
                                <pre className="text-xs bg-muted rounded p-2 font-mono">{newKeypair.envVars.verifiers}</pre>
                            </div>

                            <Button className="w-full" variant="outline" onClick={() => { setNewKeypair(null); setShowPrivateKey(false); setKeypairOpen(false) }}>
                                Listo — cerrar
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
