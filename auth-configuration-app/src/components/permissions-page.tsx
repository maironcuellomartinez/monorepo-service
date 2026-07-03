import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Alert, AlertDescription } from "./ui/alert"
import { Badge } from "./ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { permissionsApi, applicationsApi } from "../lib/api"
import { useAuth } from "../contexts/auth-context"
import { Search, Plus, Pencil, Trash2, AlertTriangle, RefreshCw, X } from "lucide-react"

interface Permission {
    id: string
    resource: string
    action: string
    description: string
    category: string
    weight: number
    isActive: boolean
}

interface AppOption {
    id: string
    name: string
}

export function PermissionsPage() {
    const { user } = useAuth()
    const [permissions, setPermissions] = useState<Permission[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")
    const [filter, setFilter] = useState("")
    const [selectedAppId, setSelectedAppId] = useState<string>("all")
    const [showInactive, setShowInactive] = useState(false)
    const [applications, setApplications] = useState<AppOption[]>([])

    // Create
    const [createOpen, setCreateOpen] = useState(false)
    const [newResource, setNewResource] = useState("")
    const [newAction, setNewAction] = useState("")
    const [newDesc, setNewDesc] = useState("")
    const [newCategory, setNewCategory] = useState("")
    const [newWeight, setNewWeight] = useState("0")

    // Edit
    const [editOpen, setEditOpen] = useState(false)
    const [selectedPerm, setSelectedPerm] = useState<Permission | null>(null)
    const [editDesc, setEditDesc] = useState("")
    const [editCategory, setEditCategory] = useState("")
    const [editWeight, setEditWeight] = useState("0")

    // Deactivate modal
    const [deactivateOpen, setDeactivateOpen] = useState(false)
    const [deactivateTarget, setDeactivateTarget] = useState<Permission | null>(null)

    // Hard delete modal
    const [deleteOpen, setDeleteOpen] = useState(false)
    const [deleteTarget, setDeleteTarget] = useState<Permission | null>(null)
    const [deleteConfirm, setDeleteConfirm] = useState("")

    const showSuccess = (msg: string) => {
        setSuccess(msg)
        setTimeout(() => setSuccess(""), 3000)
    }

    const loadApplications = useCallback(async () => {
        try {
            const { data } = await applicationsApi.list()
            setApplications(Array.isArray(data) ? data : data.applications || [])
        } catch (err) { console.error('Error cargando apps auxiliares:', err) }
    }, [])

    const load = useCallback(async () => {
        setLoading(true)
        try {
            const params: Record<string, any> = { limit: 500 }
            if (selectedAppId !== "all") params.applicationId = selectedAppId
            const { data } = await permissionsApi.list(params)
            setPermissions(Array.isArray(data) ? data : data.permissions || [])
        } catch {
            setError("Error al cargar permisos")
        } finally {
            setLoading(false)
        }
    }, [selectedAppId])

    useEffect(() => { loadApplications() }, [loadApplications])
    useEffect(() => { load() }, [load])

    const handleCreate = async () => {
        if (!newResource || !newAction) return
        try {
            await permissionsApi.create({
                resource: newResource,
                action: newAction,
                description: newDesc,
                category: newCategory || 'system',
                weight: parseInt(newWeight) || 0,
                createdBy: user?.id || 'system',
            })
            showSuccess("Permiso creado")
            setCreateOpen(false)
            setNewResource(""); setNewAction(""); setNewDesc(""); setNewCategory(""); setNewWeight("0")
            load()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al crear permiso")
        }
    }

    const openEdit = (perm: Permission) => {
        setSelectedPerm(perm)
        setEditDesc(perm.description || "")
        setEditCategory(perm.category || "")
        setEditWeight(String(perm.weight || 0))
        setEditOpen(true)
    }

    const handleEdit = async () => {
        if (!selectedPerm) return
        try {
            await permissionsApi.update(selectedPerm.id, {
                description: editDesc,
                category: editCategory,
                weight: parseInt(editWeight) || 0,
                updatedBy: user?.id,
            })
            showSuccess("Permiso actualizado")
            setEditOpen(false)
            load()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al actualizar permiso")
        }
    }

    const confirmDeactivate = async () => {
        if (!deactivateTarget) return
        try {
            await permissionsApi.deactivate(deactivateTarget.id, user?.id)
            showSuccess("Permiso desactivado")
            setDeactivateOpen(false)
            setDeactivateTarget(null)
            load()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al desactivar permiso")
        }
    }

    const handleReactivate = async (perm: Permission) => {
        try {
            await permissionsApi.reactivate(perm.id, user?.id)
            showSuccess("Permiso reactivado")
            load()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al reactivar permiso")
        }
    }

    const confirmHardDelete = async () => {
        if (!deleteTarget) return
        const key = `${deleteTarget.resource}:${deleteTarget.action}`
        if (deleteConfirm !== key) return
        try {
            await permissionsApi.hardDelete(deleteTarget.id)
            showSuccess("Permiso eliminado permanentemente")
            setDeleteOpen(false)
            setDeleteTarget(null)
            setDeleteConfirm("")
            load()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al eliminar permiso")
        }
    }

    const filtered = permissions.filter((p) => {
        if (!showInactive && p.isActive === false) return false
        if (!filter) return true
        const term = filter.toLowerCase()
        return (
            p.resource.toLowerCase().includes(term) ||
            p.action.toLowerCase().includes(term) ||
            p.description?.toLowerCase().includes(term) ||
            p.category?.toLowerCase().includes(term)
        )
    })

    const grouped = filtered.reduce<Record<string, Permission[]>>((acc, p) => {
        const cat = p.category || 'other'
        if (!acc[cat]) acc[cat] = []
        acc[cat].push(p)
        return acc
    }, {})

    return (
        <div className="space-y-6">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Permisos</CardTitle>
                            <CardDescription>
                                {selectedAppId === "all"
                                    ? `Catalogo completo — ${permissions.length} permisos. Formato: resource:action`
                                    : `${permissions.length} permisos asignados a roles de esta aplicacion`
                                }
                            </CardDescription>
                        </div>
                        <Button onClick={() => setCreateOpen(true)} size="sm">
                            <Plus className="h-4 w-4 mr-1" /> Crear Permiso
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-3 mb-4">
                        <Select value={selectedAppId} onValueChange={setSelectedAppId}>
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
                        <button
                            onClick={() => setShowInactive(v => !v)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium transition-colors ${showInactive ? 'bg-muted border-muted-foreground/40 text-foreground' : 'border-border text-muted-foreground hover:text-foreground'}`}
                        >
                            <span className={`inline-block w-2 h-2 rounded-full ${showInactive ? 'bg-gray-400' : 'bg-green-500'}`} />
                            {showInactive ? 'Mostrando inactivos' : 'Solo activos'}
                        </button>
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Filtrar por recurso, accion o categoria..."
                                value={filter}
                                onChange={(e) => setFilter(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                    </div>

                    {loading ? (
                        <p className="text-center text-muted-foreground py-8">Cargando...</p>
                    ) : (
                        Object.entries(grouped).sort().map(([category, perms]) => (
                            <div key={category} className="mb-6">
                                <h3 className="font-semibold text-sm uppercase text-muted-foreground mb-2 flex items-center gap-2">
                                    {category}
                                    <Badge variant="secondary">{perms.length}</Badge>
                                </h3>
                                <Table className="table-fixed">
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-64">Permiso</TableHead>
                                            <TableHead className="pl-6">Descripcion</TableHead>
                                            <TableHead className="w-20">Peso</TableHead>
                                            <TableHead className="w-24">Estado</TableHead>
                                            <TableHead className="w-28">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {perms.map((p) => (
                                            <TableRow key={p.id}>
                                                <TableCell className="font-mono text-sm truncate" title={`${p.resource}:${p.action}`}>{p.resource}:{p.action}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground truncate pl-6" title={p.description}>{p.description}</TableCell>
                                                <TableCell className="font-mono text-sm">{p.weight}</TableCell>
                                                <TableCell>
                                                    {p.isActive !== false ? (
                                                        <Badge variant="outline" className="text-green-700 border-green-300">activo</Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-gray-500">inactivo</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex gap-1">
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            title="Editar"
                                                            onClick={() => openEdit(p)}
                                                        >
                                                            <Pencil className="h-4 w-4" />
                                                        </Button>
                                                        {p.isActive !== false ? (
                                                            <Button
                                                                variant="ghost"
                                                                size="icon"
                                                                title="Desactivar"
                                                                onClick={() => { setDeactivateTarget(p); setDeactivateOpen(true) }}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        ) : (
                                                            <>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    title="Reactivar"
                                                                    className="text-green-600 hover:text-green-700"
                                                                    onClick={() => handleReactivate(p)}
                                                                >
                                                                    <RefreshCw className="h-4 w-4" />
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    title="Eliminar permanentemente"
                                                                    className="text-destructive hover:text-destructive"
                                                                    onClick={() => { setDeleteTarget(p); setDeleteConfirm(""); setDeleteOpen(true) }}
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
                            </div>
                        ))
                    )}
                </CardContent>
            </Card>

            {/* Deactivate Modal */}
            <Dialog open={deactivateOpen} onOpenChange={setDeactivateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Desactivar permiso</DialogTitle>
                    </DialogHeader>
                    {deactivateTarget && (
                        <div className="space-y-4">
                            <div className="bg-muted rounded p-3 text-sm space-y-1">
                                <div className="font-mono font-semibold">{deactivateTarget.resource}:{deactivateTarget.action}</div>
                                <div className="text-muted-foreground">{deactivateTarget.description}</div>
                                <div><span className="font-medium">Categoria:</span> {deactivateTarget.category}</div>
                            </div>
                            <div className="flex items-start gap-2 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded p-3">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>Los roles que tienen este permiso asignado dejaran de concederlo. Puede restaurarse al reactivar el permiso.</span>
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
                        <DialogTitle>Eliminar permiso permanentemente</DialogTitle>
                    </DialogHeader>
                    {deleteTarget && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2 text-sm text-destructive bg-red-50 border border-red-200 rounded p-3">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-medium">Esta accion es irreversible.</p>
                                    <p>Se eliminaran permanentemente:</p>
                                    <ul className="list-disc list-inside mt-1 space-y-0.5">
                                        <li>Asignaciones del permiso en roles</li>
                                        <li>Asignaciones del permiso en politicas</li>
                                        <li>El registro del permiso</li>
                                    </ul>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Escribe el permiso para confirmar</Label>
                                <p className="text-xs font-mono text-muted-foreground">{deleteTarget.resource}:{deleteTarget.action}</p>
                                <Input
                                    value={deleteConfirm}
                                    onChange={(e) => setDeleteConfirm(e.target.value)}
                                    placeholder={`${deleteTarget.resource}:${deleteTarget.action}`}
                                />
                            </div>
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancelar</Button>
                                <Button
                                    variant="destructive"
                                    disabled={deleteConfirm !== `${deleteTarget.resource}:${deleteTarget.action}`}
                                    onClick={confirmHardDelete}
                                >
                                    Eliminar permanentemente
                                </Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Create Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Crear permiso</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Recurso</Label>
                                <Input
                                    value={newResource}
                                    onChange={(e) => setNewResource(e.target.value)}
                                    placeholder="incidents, users, requests..."
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Accion</Label>
                                <Input
                                    value={newAction}
                                    onChange={(e) => setNewAction(e.target.value)}
                                    placeholder="read, write, delete, admin..."
                                />
                            </div>
                        </div>
                        {(newResource || newAction) && (
                            <p className="text-xs text-muted-foreground font-mono">
                                Permiso: <span className="font-semibold text-foreground">{newResource || '?'}:{newAction || '?'}</span>
                            </p>
                        )}
                        <div className="space-y-2">
                            <Label>Descripcion</Label>
                            <Input
                                value={newDesc}
                                onChange={(e) => setNewDesc(e.target.value)}
                                placeholder="Descripcion del permiso"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Categoria</Label>
                                <Input
                                    value={newCategory}
                                    onChange={(e) => setNewCategory(e.target.value)}
                                    placeholder="system, incidents, users..."
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Peso</Label>
                                <Input
                                    type="number"
                                    value={newWeight}
                                    onChange={(e) => setNewWeight(e.target.value)}
                                />
                            </div>
                        </div>
                        <Button
                            onClick={handleCreate}
                            className="w-full"
                            disabled={!newResource || !newAction}
                        >
                            Crear
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar permiso</DialogTitle>
                    </DialogHeader>
                    {selectedPerm && (
                        <div className="space-y-4">
                            <p className="font-mono text-sm bg-muted px-3 py-2 rounded">
                                {selectedPerm.resource}:{selectedPerm.action}
                            </p>
                            <p className="text-xs text-muted-foreground">
                                El recurso y la accion no se pueden modificar.
                            </p>
                            <div className="space-y-2">
                                <Label>Descripcion</Label>
                                <Input
                                    value={editDesc}
                                    onChange={(e) => setEditDesc(e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Categoria</Label>
                                    <Input
                                        value={editCategory}
                                        onChange={(e) => setEditCategory(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Peso</Label>
                                    <Input
                                        type="number"
                                        value={editWeight}
                                        onChange={(e) => setEditWeight(e.target.value)}
                                    />
                                </div>
                            </div>
                            <Button onClick={handleEdit} className="w-full">Guardar</Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    )
}
