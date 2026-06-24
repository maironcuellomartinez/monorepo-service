import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Alert, AlertDescription } from "./ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { rolesApi, permissionsApi, applicationsApi } from "../lib/api"
import { Plus, Pencil, Trash2, X, AlertTriangle, RefreshCw, Search } from "lucide-react"

interface Role {
    id: string; name: string; description: string;
    type: string; weight: number; applicationId: string; isActive?: boolean;
}

interface RolePermission {
    id: string; effect: string; isActive?: boolean;
    permission: { id: string; resource: string; action: string; description: string };
}

interface PermissionItem {
    id: string; resource: string; action: string; description: string; category: string;
}

interface AppItem {
    id: string; name: string;
}

export function RolesPage() {
    const [roles, setRoles] = useState<Role[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")

    // Detail / edit
    const [selectedRole, setSelectedRole] = useState<Role | null>(null)
    const [rolePermissions, setRolePermissions] = useState<RolePermission[]>([])
    const [detailOpen, setDetailOpen] = useState(false)
    const [detailSearch, setDetailSearch] = useState("")

    // Create
    const [createOpen, setCreateOpen] = useState(false)
    const [newName, setNewName] = useState("")
    const [newDesc, setNewDesc] = useState("")
    const [newType, setNewType] = useState<string>("custom")
    const [newWeight, setNewWeight] = useState("0")
    const [newAppId, setNewAppId] = useState("")

    // Edit
    const [editOpen, setEditOpen] = useState(false)
    const [editName, setEditName] = useState("")
    const [editDesc, setEditDesc] = useState("")
    const [editWeight, setEditWeight] = useState("0")

    // Add permission
    const [addPermOpen, setAddPermOpen] = useState(false)
    const [allPermissions, setAllPermissions] = useState<PermissionItem[]>([])
    const [selectedPermId, setSelectedPermId] = useState("")
    const [selectedEffect, setSelectedEffect] = useState<string>("allow")
    const [permSearch, setPermSearch] = useState("")

    // Applications for dropdown + filter
    const [applications, setApplications] = useState<AppItem[]>([])
    const [filterAppId, setFilterAppId] = useState("all")
    const [filterName, setFilterName] = useState("")

    // Deactivate modal
    const [deactivateOpen, setDeactivateOpen] = useState(false)
    const [deactivateTarget, setDeactivateTarget] = useState<Role | null>(null)

    // Hard delete modal
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<Role | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState("")

    const showSuccess = (msg: string) => {
        setSuccess(msg)
        setTimeout(() => setSuccess(""), 3000)
    }

    const loadRoles = useCallback(async () => {
        setLoading(true)
        try {
            // limit=500 para asegurarse de traer todos los roles
            const { data } = await rolesApi.list(undefined, 500)
            setRoles(Array.isArray(data) ? data : data.roles || [])
        } catch {
            setError("Error al cargar roles")
        } finally {
            setLoading(false)
        }
    }, [])

    const loadApplications = useCallback(async () => {
        try {
            const { data } = await applicationsApi.list()
            setApplications(Array.isArray(data) ? data : data.applications || [])
        } catch (err) { console.error('Error cargando apps auxiliares:', err) }
    }, [])

    useEffect(() => { loadRoles(); loadApplications() }, [loadRoles, loadApplications])

    const openDetail = async (role: Role) => {
        setSelectedRole(role)
        setDetailSearch("")
        setDetailOpen(true)
        try {
            const { data } = await rolesApi.getById(role.id)
            setRolePermissions(data.permissions || [])
        } catch {
            setRolePermissions([])
        }
    }

    const handleCreate = async () => {
        if (!newName || !newAppId) return
        try {
            await rolesApi.create({
                name: newName,
                description: newDesc,
                applicationId: newAppId,
                type: newType as 'system' | 'custom',
                weight: parseInt(newWeight) || 0,
            })
            showSuccess("Rol creado")
            setCreateOpen(false)
            setNewName(""); setNewDesc(""); setNewType("custom"); setNewWeight("0"); setNewAppId("")
            loadRoles()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al crear rol")
        }
    }

    const openEdit = (role: Role) => {
        setSelectedRole(role)
        setEditName(role.name)
        setEditDesc(role.description)
        setEditWeight(String(role.weight))
        setEditOpen(true)
    }

    const handleEdit = async () => {
        if (!selectedRole) return
        try {
            await rolesApi.update(selectedRole.id, {
                name: editName,
                description: editDesc,
                weight: parseInt(editWeight) || 0,
            })
            showSuccess("Rol actualizado")
            setEditOpen(false)
            loadRoles()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al actualizar rol")
        }
    }

    const confirmDeactivate = async () => {
        if (!deactivateTarget) return
        try {
            await rolesApi.deactivate(deactivateTarget.id)
            showSuccess("Rol desactivado")
            setDeactivateOpen(false)
            setDeactivateTarget(null)
            loadRoles()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al desactivar rol")
        }
    }

    const handleReactivate = async (role: Role) => {
        try {
            await rolesApi.reactivate(role.id)
            showSuccess("Rol reactivado")
            loadRoles()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al reactivar rol")
        }
    }

    const confirmHardDelete = async () => {
        if (!deleteTarget || deleteConfirm !== deleteTarget.name) return
        try {
            await rolesApi.hardDelete(deleteTarget.id)
            showSuccess("Rol eliminado permanentemente")
            setDeleteOpen(false)
            setDeleteTarget(null)
            setDeleteConfirm("")
            loadRoles()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al eliminar rol")
        }
    }

    const openAddPermission = async () => {
        setAddPermOpen(true)
        setSelectedPermId("")
        setSelectedEffect("allow")
        setPermSearch("")
        try {
            const { data } = await permissionsApi.list({ limit: 200 })
            setAllPermissions(Array.isArray(data) ? data : data.permissions || [])
        } catch { setAllPermissions([]) }
    }

    const handleAddPermission = async () => {
        if (!selectedRole || !selectedPermId) return
        try {
            await rolesApi.addPermission(selectedRole.id, selectedPermId, selectedEffect)
            showSuccess("Permiso asignado")
            setAddPermOpen(false)
            const { data } = await rolesApi.getById(selectedRole.id)
            setRolePermissions(data.permissions || [])
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al asignar permiso")
        }
    }

    const handleRemovePermission = async (permissionId: string) => {
        if (!selectedRole) return
        try {
            await rolesApi.removePermission(selectedRole.id, permissionId)
            setRolePermissions(prev => prev.filter(rp => rp.permission?.id !== permissionId))
            showSuccess("Permiso removido")
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al remover permiso")
        }
    }

    const appName = (id: string) => applications.find(a => a.id === id)?.name ?? id

    const filteredRoles = roles.filter(r => {
        if (filterAppId !== 'all' && r.applicationId !== filterAppId) return false
        if (filterName && !r.name.toLowerCase().includes(filterName.toLowerCase())) return false
        return true
    })

    // Solo contar como "asignados" los permisos activos — los desactivados vuelven a estar disponibles
    const assignedPermIds = new Set(
        rolePermissions.filter(rp => rp.isActive !== false).map(rp => rp.permission?.id)
    )

    // Permisos disponibles para agregar — filtrados por búsqueda inline
    const availablePermissions = useMemo(() => {
        const term = permSearch.toLowerCase()
        return allPermissions
            .filter(p => !assignedPermIds.has(p.id))
            .filter(p => !term || `${p.resource}:${p.action} ${p.description}`.toLowerCase().includes(term))
    }, [allPermissions, assignedPermIds, permSearch])

    // Permisos ya asignados — filtrados por búsqueda en detalle
    const filteredRolePermissions = useMemo(() => {
        const term = detailSearch.toLowerCase()
        if (!term) return rolePermissions
        return rolePermissions.filter(rp =>
            `${rp.permission?.resource}:${rp.permission?.action}`.toLowerCase().includes(term)
        )
    }, [rolePermissions, detailSearch])

    const selectedPerm = allPermissions.find(p => p.id === selectedPermId)

    return (
        <div className="space-y-6">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Roles</CardTitle>
                            <CardDescription>Roles del sistema y custom. Haz clic en un rol para gestionar sus permisos.</CardDescription>
                        </div>
                        <Button onClick={() => setCreateOpen(true)} size="sm">
                            <Plus className="h-4 w-4 mr-1" /> Crear Rol
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3 mb-4">
                        <Select value={filterAppId} onValueChange={setFilterAppId}>
                            <SelectTrigger className="w-56">
                                <SelectValue placeholder="Filtrar por aplicacion" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todas las aplicaciones</SelectItem>
                                {applications.map(app => (
                                    <SelectItem key={app.id} value={app.id}>{app.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Buscar por nombre de rol..."
                                value={filterName}
                                onChange={(e) => setFilterName(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        <span className="text-sm text-muted-foreground self-center whitespace-nowrap">
                            {filteredRoles.length} / {roles.length}
                        </span>
                    </div>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Aplicacion</TableHead>
                                <TableHead>Descripcion</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Peso</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={7} className="text-center">Cargando...</TableCell></TableRow>
                            ) : filteredRoles.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">Sin roles{filterName ? ` que coincidan con "${filterName}"` : ''}</TableCell></TableRow>
                            ) : filteredRoles.map((role) => (
                                <TableRow key={role.id} className="cursor-pointer hover:bg-muted/50">
                                    <TableCell className="font-medium" onClick={() => openDetail(role)}>{role.name}</TableCell>
                                    <TableCell className="text-sm" onClick={() => openDetail(role)}>{appName(role.applicationId)}</TableCell>
                                    <TableCell className="text-sm text-muted-foreground" onClick={() => openDetail(role)}>{role.description}</TableCell>
                                    <TableCell onClick={() => openDetail(role)}>
                                        <span className={`px-2 py-1 rounded text-xs ${role.type === 'system' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}`}>
                                            {role.type}
                                        </span>
                                    </TableCell>
                                    <TableCell className="font-mono" onClick={() => openDetail(role)}>{role.weight}</TableCell>
                                    <TableCell onClick={() => openDetail(role)}>
                                        <span className={`px-2 py-1 rounded text-xs ${role.isActive !== false ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {role.isActive !== false ? 'activo' : 'inactivo'}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-1">
                                            <Button variant="ghost" size="icon" title="Editar" onClick={(e) => { e.stopPropagation(); openEdit(role) }}>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                            {role.type !== 'system' && (
                                                role.isActive !== false ? (
                                                    <Button
                                                        variant="ghost" size="icon"
                                                        title="Desactivar"
                                                        onClick={(e) => { e.stopPropagation(); setDeactivateTarget(role); setDeactivateOpen(true) }}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                ) : (
                                                    <>
                                                        <Button
                                                            variant="ghost" size="icon"
                                                            title="Reactivar"
                                                            className="text-green-600 hover:text-green-700"
                                                            onClick={(e) => { e.stopPropagation(); handleReactivate(role) }}
                                                        >
                                                            <RefreshCw className="h-4 w-4" />
                                                        </Button>
                                                        <Button
                                                            variant="ghost" size="icon"
                                                            title="Eliminar permanentemente"
                                                            className="text-destructive hover:text-destructive"
                                                            onClick={(e) => { e.stopPropagation(); setDeleteTarget(role); setDeleteConfirm(""); setDeleteOpen(true) }}
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    </>
                                                )
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Deactivate Modal */}
            <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Desactivar rol</DialogTitle>
                    </DialogHeader>
                    {deactivateTarget && (
                        <div className="space-y-4">
                            <div className="bg-muted rounded p-3 text-sm space-y-1">
                                <div><span className="font-medium">Nombre:</span> {deactivateTarget.name}</div>
                                <div><span className="font-medium">Tipo:</span> {deactivateTarget.type}</div>
                                <div><span className="font-medium">Descripcion:</span> {deactivateTarget.description || '-'}</div>
                            </div>
                            <div className="flex items-start gap-2 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded p-3">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>Los usuarios con este rol perderan los permisos asociados. La configuracion se conserva y puede restaurarse al reactivar.</span>
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
                        <DialogTitle>Eliminar rol permanentemente</DialogTitle>
                    </DialogHeader>
                    {deleteTarget && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2 text-sm text-destructive bg-red-50 border border-red-200 rounded p-3">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-medium">Esta accion es irreversible.</p>
                                    <p>Se eliminaran permanentemente:</p>
                                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                                        <li>Asignaciones de este rol a usuarios</li>
                                        <li>Permisos asignados al rol</li>
                                        <li>El registro del rol</li>
                                    </ul>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Escribe el nombre del rol para confirmar</Label>
                                <p className="text-xs font-mono text-muted-foreground">{deleteTarget.name}</p>
                                <Input
                                    value={deleteConfirm}
                                    onChange={(e) => setDeleteConfirm(e.target.value)}
                                    placeholder={deleteTarget.name}
                                />
                            </div>
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
                                <Button
                                    variant="destructive"
                                    disabled={deleteConfirm !== deleteTarget.name}
                                    onClick={confirmHardDelete}
                                >
                                    Eliminar permanentemente
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Create Role Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Crear rol</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Nombre</Label>
                            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="viewer, editor, etc." />
                        </div>
                        <div className="space-y-2">
                            <Label>Descripcion</Label>
                            <Input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Aplicacion</Label>
                            <Select value={newAppId} onValueChange={setNewAppId}>
                                <SelectTrigger><SelectValue placeholder="Seleccionar aplicacion" /></SelectTrigger>
                                <SelectContent>
                                    {applications.map(app => (
                                        <SelectItem key={app.id} value={app.id}>{app.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Tipo</Label>
                                <Select value={newType} onValueChange={setNewType}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="custom">custom</SelectItem>
                                        <SelectItem value="system">system</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Peso</Label>
                                <Input type="number" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} />
                            </div>
                        </div>
                        <Button onClick={handleCreate} className="w-full">Crear</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Role Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Editar rol: {selectedRole?.name}</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Nombre</Label>
                            <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Descripcion</Label>
                            <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                            <Label>Peso</Label>
                            <Input type="number" value={editWeight} onChange={(e) => setEditWeight(e.target.value)} />
                        </div>
                        <Button onClick={handleEdit} className="w-full">Guardar</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Role Detail + Permissions Dialog */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
                    <DialogHeader className="shrink-0">
                        <DialogTitle>Rol: {selectedRole?.name}</DialogTitle>
                    </DialogHeader>
                    {selectedRole && (
                        <div className="flex flex-col gap-4 overflow-hidden min-h-0">
                            <div className="text-sm text-muted-foreground shrink-0">{selectedRole.description}</div>
                            <div className="grid grid-cols-3 gap-4 text-sm shrink-0">
                                <div><span className="font-medium">Aplicacion:</span> {appName(selectedRole.applicationId)}</div>
                                <div><span className="font-medium">Tipo:</span> {selectedRole.type}</div>
                                <div><span className="font-medium">Peso:</span> {selectedRole.weight}</div>
                            </div>

                            {/* Permissions section — scrollable */}
                            <div className="flex flex-col gap-2 min-h-0 flex-1">
                                <div className="flex items-center justify-between shrink-0">
                                    <h4 className="font-semibold text-sm">
                                        Permisos ({filteredRolePermissions.length}{detailSearch ? ` de ${rolePermissions.length}` : ''})
                                    </h4>
                                    <Button size="sm" variant="outline" onClick={openAddPermission}>
                                        <Plus className="h-4 w-4 mr-1" /> Agregar
                                    </Button>
                                </div>

                                {/* Search within assigned permissions */}
                                {rolePermissions.length > 5 && (
                                    <div className="relative shrink-0">
                                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input
                                            placeholder="Filtrar permisos asignados..."
                                            value={detailSearch}
                                            onChange={(e) => setDetailSearch(e.target.value)}
                                            className="pl-9 h-9"
                                        />
                                    </div>
                                )}

                                <div className="flex flex-col gap-1 overflow-y-auto flex-1 pr-1">
                                    {filteredRolePermissions.length === 0 ? (
                                        <div className="text-sm text-muted-foreground text-center py-4">
                                            {detailSearch ? `Sin permisos que coincidan con "${detailSearch}"` : 'Sin permisos asignados'}
                                        </div>
                                    ) : filteredRolePermissions.map((rp) => (
                                        <div key={rp.id} className="flex items-center justify-between bg-muted/50 px-3 py-2 rounded text-sm">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="font-mono truncate">{rp.permission?.resource}:{rp.permission?.action}</span>
                                                {rp.permission?.description && (
                                                    <span className="text-xs text-muted-foreground truncate hidden sm:block">
                                                        — {rp.permission.description}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className={`px-2 py-0.5 rounded text-xs ${rp.effect === 'allow' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                    {rp.effect}
                                                </span>
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemovePermission(rp.permission?.id)}>
                                                    <X className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Add Permission Dialog — lista filtrable inline */}
            <Dialog open={addPermOpen} onOpenChange={setAddPermOpen}>
                <DialogContent className="max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
                    <DialogHeader className="shrink-0">
                        <DialogTitle>Agregar permiso a: {selectedRole?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="flex flex-col gap-3 overflow-hidden min-h-0">

                        {/* Search — filtra la lista directamente */}
                        <div className="relative shrink-0">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                autoFocus
                                placeholder="Buscar: incident:read, corner, user..."
                                value={permSearch}
                                onChange={(e) => { setPermSearch(e.target.value); setSelectedPermId("") }}
                                className="pl-9"
                            />
                        </div>

                        {/* Lista filtrable — click para seleccionar */}
                        <div className="flex flex-col gap-0.5 overflow-y-auto flex-1 border rounded-md p-1 min-h-[200px]">
                            {availablePermissions.length === 0 ? (
                                <p className="text-sm text-muted-foreground text-center py-6">
                                    {permSearch ? `Sin resultados para "${permSearch}"` : 'Todos los permisos ya están asignados'}
                                </p>
                            ) : availablePermissions.map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setSelectedPermId(p.id)}
                                    className={`flex items-center justify-between w-full px-3 py-2 rounded text-sm text-left transition-colors
                                        ${selectedPermId === p.id
                                            ? 'bg-primary text-primary-foreground'
                                            : 'hover:bg-muted'
                                        }`}
                                >
                                    <span className="font-mono">{p.resource}:{p.action}</span>
                                    <span className={`text-xs truncate ml-2 max-w-[180px] ${selectedPermId === p.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                        {p.description}
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Permiso seleccionado + efecto */}
                        <div className="shrink-0 space-y-3">
                            {selectedPerm && (
                                <div className="bg-muted rounded px-3 py-2 text-sm">
                                    <span className="font-medium">Seleccionado: </span>
                                    <span className="font-mono">{selectedPerm.resource}:{selectedPerm.action}</span>
                                </div>
                            )}
                            <div className="flex items-center gap-3">
                                <Label className="shrink-0">Efecto</Label>
                                <Select value={selectedEffect} onValueChange={setSelectedEffect}>
                                    <SelectTrigger className="w-32">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="allow">allow</SelectItem>
                                        <SelectItem value="deny">deny</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button
                                    onClick={handleAddPermission}
                                    disabled={!selectedPermId}
                                    className="flex-1"
                                >
                                    Asignar permiso
                                </Button>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
