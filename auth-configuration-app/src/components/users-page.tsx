import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Alert, AlertDescription } from "./ui/alert"
import { usersApi, rolesApi, applicationsApi, policiesApi } from "../lib/api"
import { Trash2, ShieldPlus, AppWindow, Search, AlertTriangle, RefreshCw, X, ScrollText, Unlink, Pencil } from "lucide-react"

interface User {
    id: string; email: string; firstName: string; lastName: string;
    username: string; status: string; accountType: string; isActive: boolean;
    entraId?: string; createdAt: string; phone?: string;
}

interface Role {
    id: string; name: string; description?: string; weight: number; type: string; applicationId: string;
}

interface Application {
    id: string; name: string; description?: string; type: string;
}

export function UsersPage() {
    const [users, setUsers] = useState<User[]>([])
    const [roles, setRoles] = useState<Role[]>([])
    const [applications, setApplications] = useState<Application[]>([])
    const [total, setTotal] = useState(0)
    const [page, setPage] = useState(1)
    const [searchTerm, setSearchTerm] = useState("")
    const [loading, setLoading] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")

    // Dialogs
    const [selectedUser, setSelectedUser] = useState<User | null>(null)
    const [roleDialogOpen, setRoleDialogOpen] = useState(false)
    const [appDialogOpen, setAppDialogOpen] = useState(false)
    const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([])
    const [selectedAppIds, setSelectedAppIds] = useState<string[]>([])

    // User detail
    const [userRoles, setUserRoles] = useState<any[]>([])
    const [userApps, setUserApps] = useState<any[]>([])
    const [userPolicies, setUserPolicies] = useState<any[]>([])
    const [detailUser, setDetailUser] = useState<User | null>(null)
    const [detailOpen, setDetailOpen] = useState(false)

    // Policy assignment
    const [allPolicies, setAllPolicies] = useState<any[]>([])
    const [policyDialogOpen, setPolicyDialogOpen] = useState(false)
    const [selectedPolicyIds, setSelectedPolicyIds] = useState<string[]>([])

    // Edit modal
    const [editOpen, setEditOpen] = useState(false)
    const [editTarget, setEditTarget] = useState<User | null>(null)
    const [editForm, setEditForm] = useState({ firstName: "", lastName: "", username: "", phone: "" })

    // Deactivate modal
    const [deactivateOpen, setDeactivateOpen] = useState(false)
    const [deactivateTarget, setDeactivateTarget] = useState<User | null>(null)

    // Hard delete modal
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<User | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState("")

    const loadUsers = useCallback(async () => {
        setLoading(true)
        try {
            const { data } = await usersApi.list({ searchTerm: searchTerm || undefined, page, limit: 50 })
            setUsers(data.users)
            setTotal(data.total)
        } catch {
            setError("Error al cargar usuarios")
        } finally {
            setLoading(false)
        }
    }, [searchTerm, page])

    const loadRolesAndApps = useCallback(async () => {
        try {
            const [rolesRes, appsRes] = await Promise.all([
                rolesApi.list(),
                applicationsApi.list(),
            ])
            setRoles(Array.isArray(rolesRes.data) ? rolesRes.data : rolesRes.data.roles || [])
            setApplications(Array.isArray(appsRes.data) ? appsRes.data : appsRes.data.applications || [])
        } catch (err) { console.error('Error cargando roles/apps auxiliares:', err) }
    }, [])

    useEffect(() => { loadUsers() }, [loadUsers])
    useEffect(() => { loadRolesAndApps() }, [loadRolesAndApps])

    const showSuccess = (msg: string) => {
        setSuccess(msg)
        setTimeout(() => setSuccess(""), 3000)
    }

    const openDetail = async (user: User) => {
        setDetailUser(user)
        setDetailOpen(true)
        try {
            const [rolesRes, appsRes, policiesRes] = await Promise.all([
                usersApi.getRoles(user.id),
                usersApi.getApplications(user.id),
                usersApi.getPolicies(user.id),
            ])
            setUserRoles(rolesRes.data)
            setUserApps(appsRes.data)
            setUserPolicies(Array.isArray(policiesRes.data) ? policiesRes.data : [])
        } catch {
            setUserRoles([])
            setUserApps([])
            setUserPolicies([])
        }
    }

    const openPolicyDialog = async (user: User) => {
        setSelectedUser(user)
        setPolicyDialogOpen(true)
        try {
            const res = await policiesApi.list()
            const list = Array.isArray(res.data) ? res.data : (res.data.policies || [])
            setAllPolicies(list.filter((p: any) => p.isActive !== false))
        } catch (err) { console.error('Error cargando políticas:', err) }
    }

    const handleAssignPolicy = async () => {
        if (!selectedUser || selectedPolicyIds.length === 0) return
        setSubmitting(true)
        try {
            await Promise.all(selectedPolicyIds.map(pId => usersApi.assignPolicy(selectedUser.id, pId)))
            showSuccess(`${selectedPolicyIds.length > 1 ? `${selectedPolicyIds.length} políticas asignadas` : "Política asignada"} correctamente`)
            setPolicyDialogOpen(false)
            setSelectedPolicyIds([])
            if (detailUser?.id === selectedUser.id) openDetail(selectedUser)
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al asignar política")
        } finally {
            setSubmitting(false)
        }
    }

    const handleRemovePolicy = async (userId: string, policyId: string) => {
        try {
            await usersApi.removePolicy(userId, policyId)
            showSuccess("Política desasignada")
            if (detailUser) openDetail(detailUser)
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al desasignar política")
        }
    }

    const handleAssignRole = async () => {
        if (!selectedUser || selectedRoleIds.length === 0) return
        setSubmitting(true)
        try {
            await Promise.all(selectedRoleIds.map(rId => {
                const role = roles.find(r => r.id === rId)!
                return usersApi.assignRole(selectedUser.id, rId, role.applicationId)
            }))
            showSuccess(`${selectedRoleIds.length > 1 ? `${selectedRoleIds.length} roles asignados` : "Rol asignado"} correctamente`)
            setRoleDialogOpen(false)
            setSelectedRoleIds([])
            if (detailUser?.id === selectedUser.id) openDetail(selectedUser)
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al asignar rol")
        } finally {
            setSubmitting(false)
        }
    }

    const handleRemoveRole = async (userId: string, roleId: string) => {
        try {
            await usersApi.removeRole(userId, roleId)
            showSuccess("Rol removido")
            if (detailUser) openDetail(detailUser)
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al remover rol")
        }
    }

    const handleAssignApp = async () => {
        if (!selectedUser || selectedAppIds.length === 0) return
        setSubmitting(true)
        try {
            await Promise.all(selectedAppIds.map(aId => usersApi.assignApplication(selectedUser.id, aId)))
            showSuccess(`${selectedAppIds.length > 1 ? `${selectedAppIds.length} aplicaciones vinculadas` : "Aplicacion vinculada"} correctamente`)
            setAppDialogOpen(false)
            setSelectedAppIds([])
            if (detailUser?.id === selectedUser.id) openDetail(selectedUser)
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al vincular aplicacion")
        } finally {
            setSubmitting(false)
        }
    }

    const handleRemoveApp = async (userId: string, appId: string) => {
        try {
            await usersApi.removeApplication(userId, appId)
            showSuccess("Aplicacion desvinculada")
            if (detailUser) openDetail(detailUser)
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al desvincular")
        }
    }

    const confirmDeactivate = async () => {
        if (!deactivateTarget) return
        try {
            await usersApi.deactivate(deactivateTarget.id)
            showSuccess("Usuario desactivado")
            setDeactivateOpen(false)
            setDeactivateTarget(null)
            loadUsers()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al desactivar")
        }
    }

    const openEdit = (user: User) => {
        setEditTarget(user)
        setEditForm({
            firstName: user.firstName || "",
            lastName: user.lastName || "",
            username: user.username || "",
            phone: user.phone || "",
        })
        setEditOpen(true)
    }

    const handleSaveEdit = async () => {
        if (!editTarget) return
        setSubmitting(true)
        try {
            await usersApi.update(editTarget.id, {
                firstName: editForm.firstName.trim(),
                lastName: editForm.lastName.trim(),
                username: editForm.username.trim(),
                phone: editForm.phone.trim() || undefined,
            })
            showSuccess("Usuario actualizado correctamente")
            setEditOpen(false)
            setEditTarget(null)
            loadUsers()
            if (detailUser?.id === editTarget.id) {
                setDetailUser(prev => prev ? { ...prev, ...editForm } : prev)
            }
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al actualizar usuario")
        } finally {
            setSubmitting(false)
        }
    }

    const handleUnlinkEntra = async (user: User) => {
        try {
            await usersApi.update(user.id, { entraId: null })
            showSuccess("Usuario desvinculado de Azure AD")
            setDetailUser(prev => prev ? { ...prev, entraId: undefined } : prev)
            loadUsers()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al desvincular")
        }
    }

    const handleReactivate = async (user: User) => {
        try {
            await usersApi.reactivate(user.id)
            showSuccess("Usuario reactivado")
            loadUsers()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al reactivar")
        }
    }

    const confirmHardDelete = async () => {
        if (!deleteTarget || deleteConfirm !== deleteTarget.email) return
        try {
            await usersApi.hardDelete(deleteTarget.id)
            showSuccess("Usuario eliminado permanentemente")
            setDeleteOpen(false)
            setDeleteTarget(null)
            setDeleteConfirm("")
            loadUsers()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al eliminar")
        }
    }

    const entraUsers = users.filter(u => u.accountType === 'user')
    const totalPages = Math.ceil(total / 50)

    const UserTable = ({ list, showEntraId = false }: { list: User[], showEntraId?: boolean }) => (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Estado</TableHead>
                    {showEntraId && <TableHead>Entra ID</TableHead>}
                    <TableHead>Acciones</TableHead>
                </TableRow>
            </TableHeader>
            <TableBody>
                {loading ? (
                    <TableRow><TableCell colSpan={showEntraId ? 5 : 4} className="text-center">Cargando...</TableCell></TableRow>
                ) : list.length === 0 ? (
                    <TableRow>
                        <TableCell colSpan={showEntraId ? 5 : 4} className="text-center text-muted-foreground py-8">
                            Sin usuarios
                        </TableCell>
                    </TableRow>
                ) : list.map((user) => (
                    <TableRow
                        key={user.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openDetail(user)}
                    >
                        <TableCell className="font-mono text-sm">{user.email}</TableCell>
                        <TableCell>{user.firstName} {user.lastName}</TableCell>
                        <TableCell>
                            <span className={`px-2 py-1 rounded text-xs ${user.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                {user.isActive ? 'activo' : 'inactivo'}
                            </span>
                        </TableCell>
                        {showEntraId && (
                            <TableCell>
                                {user.entraId ? (
                                    <span className="px-2 py-1 rounded text-xs bg-cyan-100 text-cyan-800">vinculado</span>
                                ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                )}
                            </TableCell>
                        )}
                        <TableCell>
                            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                    variant="ghost" size="icon"
                                    title="Editar datos"
                                    onClick={() => openEdit(user)}
                                >
                                    <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost" size="icon"
                                    title="Asignar rol"
                                    onClick={() => { setSelectedUser(user); setRoleDialogOpen(true) }}
                                >
                                    <ShieldPlus className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost" size="icon"
                                    title="Vincular aplicacion"
                                    onClick={() => { setSelectedUser(user); setAppDialogOpen(true) }}
                                >
                                    <AppWindow className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="ghost" size="icon"
                                    title="Asignar política"
                                    onClick={() => openPolicyDialog(user)}
                                >
                                    <ScrollText className="h-4 w-4" />
                                </Button>
                                {user.isActive ? (
                                    <Button
                                        variant="ghost" size="icon"
                                        title="Desactivar"
                                        onClick={() => { setDeactivateTarget(user); setDeactivateOpen(true) }}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </Button>
                                ) : (
                                    <>
                                        <Button
                                            variant="ghost" size="icon"
                                            title="Reactivar"
                                            className="text-green-600 hover:text-green-700"
                                            onClick={() => handleReactivate(user)}
                                        >
                                            <RefreshCw className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost" size="icon"
                                            title="Eliminar permanentemente"
                                            className="text-destructive hover:text-destructive"
                                            onClick={() => { setDeleteTarget(user); setDeleteConfirm(""); setDeleteOpen(true) }}
                                        >
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
    )

    return (
        <div className="space-y-6">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}

            <Card>
                <CardHeader>
                    <CardTitle>Usuarios</CardTitle>
                    <CardDescription>
                        Usuarios sincronizados desde Entra ID. Total: {total}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="relative mb-4">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Buscar por email o nombre..."
                            value={searchTerm}
                            onChange={(e) => { setSearchTerm(e.target.value); setPage(1) }}
                            className="pl-9"
                        />
                    </div>

                    <p className="text-xs text-muted-foreground mb-3">
                        Usuarios humanos autenticados via Azure AD. Se crean automaticamente al hacer el primer login.
                    </p>
                    <UserTable list={entraUsers} showEntraId />

                    {totalPages > 1 && (
                        <div className="flex justify-center gap-2 mt-4">
                            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button>
                            <span className="text-sm py-2">Pagina {page} de {totalPages}</span>
                            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Siguiente</Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Deactivate Modal */}
            <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Desactivar usuario</DialogTitle>
                    </DialogHeader>
                    {deactivateTarget && (
                        <div className="space-y-4">
                            <div className="bg-muted rounded p-3 text-sm space-y-1">
                                <div><span className="font-medium">Email:</span> {deactivateTarget.email}</div>
                                <div><span className="font-medium">Nombre:</span> {deactivateTarget.firstName} {deactivateTarget.lastName}</div>
                                <div><span className="font-medium">Tipo:</span> {deactivateTarget.accountType}</div>
                            </div>
                            <div className="flex items-start gap-2 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded p-3">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>El usuario perdera acceso inmediatamente. Sus roles y configuraciones se conservan y pueden restaurarse al reactivar.</span>
                            </div>
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setDeactivateOpen(false)}>Cancelar</Button>
                                <Button variant="destructive" onClick={confirmDeactivate}>Desactivar</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Hard Delete Modal */}
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Eliminar usuario permanentemente</DialogTitle>
                    </DialogHeader>
                    {deleteTarget && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2 text-sm text-destructive bg-red-50 border border-red-200 rounded p-3">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-medium">Esta accion es irreversible.</p>
                                    <p>Se eliminaran permanentemente:</p>
                                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                                        <li>Roles asignados</li>
                                        <li>Aplicaciones vinculadas</li>
                                        <li>El registro del usuario</li>
                                    </ul>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Escribe el email del usuario para confirmar</Label>
                                <p className="text-xs font-mono text-muted-foreground">{deleteTarget.email}</p>
                                <Input
                                    value={deleteConfirm}
                                    onChange={(e) => setDeleteConfirm(e.target.value)}
                                    placeholder={deleteTarget.email}
                                />
                            </div>
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
                                <Button
                                    variant="destructive"
                                    disabled={deleteConfirm !== deleteTarget.email}
                                    onClick={confirmHardDelete}
                                >
                                    Eliminar permanentemente
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Edit User Modal */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar usuario</DialogTitle>
                    </DialogHeader>
                    {editTarget && (
                        <div className="space-y-4">
                            <p className="text-xs text-muted-foreground font-mono">{editTarget.email}</p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label>Nombre</Label>
                                    <Input
                                        value={editForm.firstName}
                                        onChange={(e) => setEditForm(f => ({ ...f, firstName: e.target.value }))}
                                        placeholder="Nombre"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label>Apellido</Label>
                                    <Input
                                        value={editForm.lastName}
                                        onChange={(e) => setEditForm(f => ({ ...f, lastName: e.target.value }))}
                                        placeholder="Apellido"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Usuario</Label>
                                <Input
                                    value={editForm.username}
                                    onChange={(e) => setEditForm(f => ({ ...f, username: e.target.value }))}
                                    placeholder="nombre.apellido"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Teléfono</Label>
                                <Input
                                    value={editForm.phone}
                                    onChange={(e) => setEditForm(f => ({ ...f, phone: e.target.value }))}
                                    placeholder="+1234567890"
                                />
                            </div>
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
                                <Button
                                    onClick={handleSaveEdit}
                                    disabled={submitting || !editForm.firstName.trim() || !editForm.lastName.trim()}
                                >
                                    {submitting ? "Guardando..." : "Guardar"}
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* User Detail Dialog */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            {detailUser?.firstName} {detailUser?.lastName}
                            {detailUser && (
                                <Button
                                    variant="ghost" size="icon" className="h-7 w-7"
                                    title="Editar datos"
                                    onClick={() => openEdit(detailUser)}
                                >
                                    <Pencil className="h-3.5 w-3.5" />
                                </Button>
                            )}
                        </DialogTitle>
                    </DialogHeader>
                    {detailUser && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div><span className="font-medium">Email:</span> {detailUser.email}</div>
                                <div><span className="font-medium">Usuario:</span> {detailUser.username}</div>
                                <div><span className="font-medium">Teléfono:</span> {detailUser.phone || '-'}</div>
                                <div><span className="font-medium">Tipo:</span> {detailUser.accountType}</div>
                                <div><span className="font-medium">Estado:</span> {detailUser.isActive ? 'Activo' : 'Inactivo'}</div>
                                <div className="flex items-center gap-2">
                                    <span className="font-medium">Entra ID:</span>
                                    {detailUser.entraId ? (
                                        <>
                                            <span className="px-2 py-0.5 rounded text-xs bg-cyan-100 text-cyan-800">vinculado</span>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-6 w-6 text-orange-500 hover:text-orange-600"
                                                title="Desvincular de Azure AD"
                                                onClick={() => handleUnlinkEntra(detailUser)}
                                            >
                                                <Unlink className="h-3.5 w-3.5" />
                                            </Button>
                                        </>
                                    ) : (
                                        <span className="text-muted-foreground">no vinculado</span>
                                    )}
                                </div>
                            </div>

                            <div>
                                <h4 className="font-semibold mb-2">Roles asignados</h4>
                                {userRoles.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Sin roles asignados</p>
                                ) : (
                                    <div className="space-y-1">
                                        {userRoles.map((ur: any) => (
                                            <div key={ur.id} className="flex items-center justify-between bg-muted/50 px-3 py-2 rounded">
                                                <span className="text-sm font-medium">{ur.role?.name || ur.roleId}</span>
                                                <Button variant="ghost" size="icon" onClick={() => handleRemoveRole(detailUser.id, ur.roleId)}>
                                                    <Trash2 className="h-3 w-3 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <h4 className="font-semibold mb-2">Aplicaciones vinculadas</h4>
                                {userApps.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Sin aplicaciones vinculadas</p>
                                ) : (
                                    <div className="space-y-1">
                                        {userApps.map((ua: any) => (
                                            <div key={ua.id} className="flex items-center justify-between bg-muted/50 px-3 py-2 rounded">
                                                <div>
                                                    <span className="text-sm font-medium">{ua.application?.name || ua.applicationId}</span>
                                                    <span className="text-xs text-muted-foreground ml-2">({ua.membershipType})</span>
                                                </div>
                                                <Button variant="ghost" size="icon" onClick={() => handleRemoveApp(detailUser.id, ua.applicationId)}>
                                                    <Trash2 className="h-3 w-3 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <div>
                                <h4 className="font-semibold mb-2">Políticas asignadas</h4>
                                {userPolicies.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Sin políticas asignadas directamente</p>
                                ) : (
                                    <div className="space-y-1">
                                        {userPolicies.map((up: any) => (
                                            <div key={up.id} className="flex items-center justify-between bg-muted/50 px-3 py-2 rounded">
                                                <div>
                                                    <span className="text-sm font-medium">{up.policy?.name || up.policyId}</span>
                                                    {up.policy?.effect && (
                                                        <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${up.policy.effect === 'allow' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                            {up.policy.effect}
                                                        </span>
                                                    )}
                                                </div>
                                                <Button variant="ghost" size="icon" onClick={() => handleRemovePolicy(detailUser.id, up.policy?.id || up.policyId)}>
                                                    <Trash2 className="h-3 w-3 text-destructive" />
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Assign Role Dialog */}
            <Dialog open={roleDialogOpen} onOpenChange={(open) => { setRoleDialogOpen(open); if (!open) setSelectedRoleIds([]) }}>
                <DialogContent className="flex flex-col max-h-[80vh]">
                    <DialogHeader className="shrink-0">
                        <DialogTitle>Asignar roles a {selectedUser?.email}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 min-h-0 flex-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground shrink-0">
                            <span>{selectedRoleIds.length} seleccionado{selectedRoleIds.length !== 1 ? 's' : ''}</span>
                            <button
                                type="button"
                                className="hover:underline"
                                onClick={() => setSelectedRoleIds(
                                    selectedRoleIds.length === roles.length ? [] : roles.map((r) => r.id)
                                )}
                            >
                                {selectedRoleIds.length === roles.length ? 'Deseleccionar todos' : 'Seleccionar todos'}
                            </button>
                        </div>
                        <div className="border rounded-md divide-y overflow-y-auto flex-1">
                            {roles.length === 0 ? (
                                <p className="text-sm text-muted-foreground px-3 py-4">Sin roles disponibles</p>
                            ) : roles.map((role) => {
                                const checked = selectedRoleIds.includes(role.id)
                                const appName = applications.find(a => a.id === role.applicationId)?.name
                                return (
                                    <label key={role.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300"
                                            checked={checked}
                                            onChange={() => setSelectedRoleIds(prev =>
                                                checked ? prev.filter(id => id !== role.id) : [...prev, role.id]
                                            )}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm font-medium">{role.name}</span>
                                            {appName && <span className="ml-2 text-xs text-muted-foreground">{appName}</span>}
                                            {role.description && <p className="text-xs text-muted-foreground truncate">{role.description}</p>}
                                        </div>
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{role.type}</span>
                                    </label>
                                )
                            })}
                        </div>
                        <Button
                            onClick={handleAssignRole}
                            className="w-full shrink-0"
                            disabled={selectedRoleIds.length === 0 || submitting}
                        >
                            {submitting ? "Asignando..." : `Asignar${selectedRoleIds.length > 1 ? ` (${selectedRoleIds.length})` : ''}`}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Assign Application Dialog */}
            <Dialog open={appDialogOpen} onOpenChange={(open) => { setAppDialogOpen(open); if (!open) setSelectedAppIds([]) }}>
                <DialogContent className="flex flex-col max-h-[80vh]">
                    <DialogHeader className="shrink-0">
                        <DialogTitle>Vincular aplicaciones a {selectedUser?.email}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 min-h-0 flex-1">
                        <div className="flex items-center justify-between text-xs text-muted-foreground shrink-0">
                            <span>{selectedAppIds.length} seleccionada{selectedAppIds.length !== 1 ? 's' : ''}</span>
                            <button
                                type="button"
                                className="hover:underline"
                                onClick={() => setSelectedAppIds(
                                    selectedAppIds.length === applications.length ? [] : applications.map(a => a.id)
                                )}
                            >
                                {selectedAppIds.length === applications.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                            </button>
                        </div>
                        <div className="border rounded-md divide-y overflow-y-auto flex-1">
                            {applications.length === 0 ? (
                                <p className="text-sm text-muted-foreground px-3 py-4">Sin aplicaciones disponibles</p>
                            ) : applications.map((app) => {
                                const checked = selectedAppIds.includes(app.id)
                                return (
                                    <label key={app.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50">
                                        <input
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-gray-300"
                                            checked={checked}
                                            onChange={() => setSelectedAppIds(prev =>
                                                checked ? prev.filter(id => id !== app.id) : [...prev, app.id]
                                            )}
                                        />
                                        <div className="flex-1 min-w-0">
                                            <span className="text-sm font-medium">{app.name}</span>
                                            {app.description && <p className="text-xs text-muted-foreground truncate">{app.description}</p>}
                                        </div>
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{app.type}</span>
                                    </label>
                                )
                            })}
                        </div>
                        <Button
                            onClick={handleAssignApp}
                            className="w-full shrink-0"
                            disabled={selectedAppIds.length === 0 || submitting}
                        >
                            {submitting ? "Vinculando..." : `Vincular${selectedAppIds.length > 1 ? ` (${selectedAppIds.length})` : ''}`}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Assign Policy Dialog */}
            <Dialog open={policyDialogOpen} onOpenChange={(open) => { setPolicyDialogOpen(open); if (!open) setSelectedPolicyIds([]) }}>
                <DialogContent className="flex flex-col max-h-[80vh]">
                    <DialogHeader className="shrink-0">
                        <DialogTitle>Asignar políticas a {selectedUser?.email}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-4 min-h-0 flex-1">
                        {allPolicies.length === 0 ? (
                            <p className="text-sm text-muted-foreground">No hay políticas disponibles</p>
                        ) : (
                            <>
                                <div className="flex items-center justify-between text-xs text-muted-foreground shrink-0">
                                    <span>{selectedPolicyIds.length} seleccionada{selectedPolicyIds.length !== 1 ? 's' : ''}</span>
                                    <button
                                        type="button"
                                        className="hover:underline"
                                        onClick={() => setSelectedPolicyIds(
                                            selectedPolicyIds.length === allPolicies.length ? [] : allPolicies.map((p: any) => p.id)
                                        )}
                                    >
                                        {selectedPolicyIds.length === allPolicies.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                                    </button>
                                </div>
                                <div className="border rounded-md divide-y overflow-y-auto flex-1">
                                    {allPolicies.map((p: any) => {
                                        const checked = selectedPolicyIds.includes(p.id)
                                        return (
                                            <label
                                                key={p.id}
                                                className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50"
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 rounded border-gray-300"
                                                    checked={checked}
                                                    onChange={() => setSelectedPolicyIds(prev =>
                                                        checked ? prev.filter(id => id !== p.id) : [...prev, p.id]
                                                    )}
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-sm font-medium">{p.name}</span>
                                                    {p.description && (
                                                        <p className="text-xs text-muted-foreground truncate">{p.description}</p>
                                                    )}
                                                </div>
                                                <span className={`text-xs px-1.5 py-0.5 rounded shrink-0 ${p.effect === 'allow' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                    {p.effect}
                                                </span>
                                            </label>
                                        )
                                    })}
                                </div>
                            </>
                        )}
                        <Button
                            onClick={handleAssignPolicy}
                            className="w-full shrink-0"
                            disabled={selectedPolicyIds.length === 0 || submitting}
                        >
                            {submitting ? "Asignando..." : `Asignar${selectedPolicyIds.length > 1 ? ` (${selectedPolicyIds.length})` : ''}`}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
