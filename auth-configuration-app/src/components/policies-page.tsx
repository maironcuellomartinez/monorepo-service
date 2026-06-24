import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card"
import { Button } from "./ui/button"
import { Input } from "./ui/input"
import { Label } from "./ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog"
import { Alert, AlertDescription } from "./ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select"
import { policiesApi, permissionsApi, applicationsApi } from "../lib/api"
import { useAuth } from "../contexts/auth-context"
import { Plus, Trash2, RefreshCw, X, AlertTriangle } from "lucide-react"
import { ConditionBuilder } from "./condition-builder"

interface Policy {
    id: string; name: string; description: string;
    type: string; priority: number; effect: string;
    isActive: boolean; applicationId: string;
}

interface PolicyRule {
    id: string; condition: any; priority: number; isActive: boolean;
}

interface PolicyPermission {
    id: string;
    permission: { id: string; resource: string; action: string };
}

interface PermissionItem {
    id: string; resource: string; action: string;
}

interface AppItem {
    id: string; name: string;
}

export function PoliciesPage() {
    const { user } = useAuth()
    const [policies, setPolicies] = useState<Policy[]>([])
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState("")
    const [success, setSuccess] = useState("")

    // Detail
    const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null)
    const [policyRules, setPolicyRules] = useState<PolicyRule[]>([])
    const [policyPermissions, setPolicyPermissions] = useState<PolicyPermission[]>([])
    const [detailOpen, setDetailOpen] = useState(false)

    // Create
    const [createOpen, setCreateOpen] = useState(false)
    const [newName, setNewName] = useState("")
    const [newDesc, setNewDesc] = useState("")
    const [newEffect, setNewEffect] = useState("allow")
    const [newType, setNewType] = useState("user")
    const [newPriority, setNewPriority] = useState("1")
    const [newAppId, setNewAppId] = useState("")

    // Add rule
    const [addRuleOpen, setAddRuleOpen] = useState(false)
    const [ruleJson, setRuleJson] = useState('{}')
    const [rulePriority, setRulePriority] = useState("1")

    // Delete rule modal
    const [deleteRuleOpen, setDeleteRuleOpen] = useState(false)
    const [deleteRuleTarget, setDeleteRuleTarget] = useState<PolicyRule | null>(null)

    // Add permission
    const [addPermOpen, setAddPermOpen] = useState(false)
    const [allPermissions, setAllPermissions] = useState<PermissionItem[]>([])
    const [selectedPermId, setSelectedPermId] = useState("")

    // Applications
    const [applications, setApplications] = useState<AppItem[]>([])

    // Deactivate modal
    const [deactivateOpen, setDeactivateOpen] = useState(false)
    const [deactivateTarget, setDeactivateTarget] = useState<Policy | null>(null)

    const showSuccess = (msg: string) => {
        setSuccess(msg)
        setTimeout(() => setSuccess(""), 3000)
    }

    const loadPolicies = useCallback(async () => {
        setLoading(true)
        try {
            const { data } = await policiesApi.list()
            setPolicies(Array.isArray(data) ? data : data.policies || [])
        } catch {
            setError("Error al cargar politicas")
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

    useEffect(() => { loadPolicies(); loadApplications() }, [loadPolicies, loadApplications])

    const openDetail = async (policy: Policy) => {
        setSelectedPolicy(policy)
        setDetailOpen(true)
        try {
            const [rulesRes, permsRes] = await Promise.all([
                policiesApi.getRules(policy.id),
                policiesApi.getPermissions(policy.id),
            ])
            setPolicyRules(Array.isArray(rulesRes.data) ? rulesRes.data : [])
            setPolicyPermissions(Array.isArray(permsRes.data) ? permsRes.data : [])
        } catch {
            setPolicyRules([])
            setPolicyPermissions([])
        }
    }

    const handleCreate = async () => {
        if (!newName || !newAppId) return
        try {
            await policiesApi.create({
                name: newName,
                description: newDesc,
                applicationId: newAppId,
                type: newType,
                priority: parseInt(newPriority) || 1,
                effect: newEffect,
            })
            showSuccess("Politica creada")
            setCreateOpen(false)
            setNewName(""); setNewDesc(""); setNewEffect("allow"); setNewType("user"); setNewPriority("1"); setNewAppId("")
            loadPolicies()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al crear politica")
        }
    }

    const confirmDeactivate = async () => {
        if (!deactivateTarget) return
        try {
            await policiesApi.deactivate(deactivateTarget.id, user?.id)
            showSuccess("Politica desactivada")
            setDeactivateOpen(false)
            setDeactivateTarget(null)
            loadPolicies()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al desactivar")
        }
    }

    const handleReactivate = async (policy: Policy) => {
        try {
            await policiesApi.reactivate(policy.id, user?.id)
            showSuccess("Politica reactivada")
            loadPolicies()
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al reactivar")
        }
    }

    // ── Rules ──────────────────────────────────────────────────

    const handleAddRule = async () => {
        if (!selectedPolicy) return
        try {
            const condition = JSON.parse(ruleJson)
            await policiesApi.addRule(selectedPolicy.id, {
                condition,
                priority: parseInt(rulePriority) || 1,
            })
            showSuccess("Regla agregada")
            setAddRuleOpen(false)
            openDetail(selectedPolicy)
        } catch (err: any) {
            if (err instanceof SyntaxError) {
                setError("JSON invalido en la condicion")
            } else {
                setError(err.response?.data?.message || "Error al agregar regla")
            }
        }
    }

    const confirmDeleteRule = async () => {
        if (!selectedPolicy || !deleteRuleTarget) return
        try {
            await policiesApi.deleteRule(deleteRuleTarget.id, user?.id)
            showSuccess("Regla eliminada")
            setDeleteRuleOpen(false)
            setDeleteRuleTarget(null)
            openDetail(selectedPolicy)
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al eliminar regla")
        }
    }

    // ── Permissions ────────────────────────────────────────────

    const openAddPermission = async () => {
        setAddPermOpen(true)
        setSelectedPermId("")
        try {
            const { data } = await permissionsApi.list()
            setAllPermissions(Array.isArray(data) ? data : data.permissions || [])
        } catch { setAllPermissions([]) }
    }

    const handleAddPermission = async () => {
        if (!selectedPolicy || !selectedPermId) return
        try {
            await policiesApi.addPermission(selectedPolicy.id, selectedPermId, user?.id)
            showSuccess("Permiso asociado")
            setAddPermOpen(false)
            openDetail(selectedPolicy)
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al asociar permiso")
        }
    }

    const handleRemovePermission = async (permissionId: string) => {
        if (!selectedPolicy) return
        try {
            await policiesApi.removePermission(selectedPolicy.id, permissionId)
            setPolicyPermissions(prev => prev.filter(pp => pp.permission?.id !== permissionId))
            showSuccess("Permiso removido")
        } catch (err: any) {
            setError(err.response?.data?.message || "Error al remover permiso")
        }
    }

    const assignedPermIds = new Set(policyPermissions.map(pp => pp.permission?.id))
    const availablePermissions = allPermissions.filter(p => !assignedPermIds.has(p.id))

    return (
        <div className="space-y-6">
            {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
            {success && <Alert><AlertDescription>{success}</AlertDescription></Alert>}

            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Politicas</CardTitle>
                            <CardDescription>Politicas ABAC con reglas json-rules-engine.</CardDescription>
                        </div>
                        <Button onClick={() => setCreateOpen(true)} size="sm">
                            <Plus className="h-4 w-4 mr-1" /> Crear Politica
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nombre</TableHead>
                                <TableHead>Efecto</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Prioridad</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={6} className="text-center">Cargando...</TableCell></TableRow>
                            ) : policies.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center">Sin politicas</TableCell></TableRow>
                            ) : policies.map((policy) => (
                                <TableRow key={policy.id} className="cursor-pointer hover:bg-muted/50">
                                    <TableCell onClick={() => openDetail(policy)}>
                                        <div>
                                            <div className="font-medium">{policy.name}</div>
                                            {policy.description && <div className="text-xs text-muted-foreground">{policy.description}</div>}
                                        </div>
                                    </TableCell>
                                    <TableCell onClick={() => openDetail(policy)}>
                                        <span className={`px-2 py-1 rounded text-xs ${policy.effect === 'allow' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                            {policy.effect}
                                        </span>
                                    </TableCell>
                                    <TableCell className="text-sm" onClick={() => openDetail(policy)}>{policy.type}</TableCell>
                                    <TableCell className="font-mono" onClick={() => openDetail(policy)}>{policy.priority}</TableCell>
                                    <TableCell onClick={() => openDetail(policy)}>
                                        <span className={`px-2 py-1 rounded text-xs ${policy.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                                            {policy.isActive ? 'activa' : 'inactiva'}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex gap-1">
                                            {policy.isActive ? (
                                                <Button
                                                    variant="ghost" size="icon"
                                                    title="Desactivar"
                                                    onClick={(e) => { e.stopPropagation(); setDeactivateTarget(policy); setDeactivateOpen(true) }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            ) : (
                                                <Button
                                                    variant="ghost" size="icon"
                                                    title="Reactivar"
                                                    className="text-green-600 hover:text-green-700"
                                                    onClick={(e) => { e.stopPropagation(); handleReactivate(policy) }}
                                                >
                                                    <RefreshCw className="h-4 w-4" />
                                                </Button>
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
                        <DialogTitle>Desactivar politica</DialogTitle>
                    </DialogHeader>
                    {deactivateTarget && (
                        <div className="space-y-4">
                            <div className="bg-muted rounded p-3 text-sm space-y-1">
                                <div className="font-medium">{deactivateTarget.name}</div>
                                {deactivateTarget.description && (
                                    <div className="text-muted-foreground">{deactivateTarget.description}</div>
                                )}
                                <div className="flex gap-4 mt-1">
                                    <span>
                                        Efecto: <span className={`font-mono font-medium ${deactivateTarget.effect === 'allow' ? 'text-green-700' : 'text-red-700'}`}>{deactivateTarget.effect}</span>
                                    </span>
                                    <span>Tipo: <span className="font-mono">{deactivateTarget.type}</span></span>
                                    <span>Prioridad: <span className="font-mono">{deactivateTarget.priority}</span></span>
                                </div>
                            </div>
                            <div className="flex items-start gap-2 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded p-3">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>La politica dejara de evaluarse en las decisiones de acceso. Puede restaurarse al reactivar.</span>
                            </div>
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setDeactivateOpen(false)}>Cancelar</Button>
                                <Button variant="destructive" onClick={confirmDeactivate}>Desactivar</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Rule Modal */}
            <Dialog open={deleteRuleOpen} onOpenChange={setDeleteRuleOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Eliminar regla</DialogTitle>
                    </DialogHeader>
                    {deleteRuleTarget && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-2 text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded p-3">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                <span>Esta regla se eliminara permanentemente de la politica.</span>
                            </div>
                            <pre className="text-xs bg-muted p-3 rounded overflow-x-auto">
                                {JSON.stringify(deleteRuleTarget.condition, null, 2)}
                            </pre>
                            <div className="flex gap-2 justify-end">
                                <Button variant="outline" onClick={() => setDeleteRuleOpen(false)}>Cancelar</Button>
                                <Button variant="destructive" onClick={confirmDeleteRule}>Eliminar regla</Button>
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Create Policy Dialog */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Crear politica</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Nombre</Label>
                            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="business-hours-only" />
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
                        <div className="grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Efecto</Label>
                                <Select value={newEffect} onValueChange={setNewEffect}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="allow">allow</SelectItem>
                                        <SelectItem value="deny">deny</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Tipo</Label>
                                <Select value={newType} onValueChange={setNewType}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="user">user</SelectItem>
                                        <SelectItem value="system">system</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Prioridad</Label>
                                <Input type="number" value={newPriority} onChange={(e) => setNewPriority(e.target.value)} />
                            </div>
                        </div>
                        <Button onClick={handleCreate} className="w-full" disabled={!newName || !newAppId}>Crear</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Policy Detail Dialog */}
            <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
                <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{selectedPolicy?.name}</DialogTitle>
                    </DialogHeader>
                    {selectedPolicy && (
                        <div className="space-y-6">
                            <div className="text-sm text-muted-foreground">{selectedPolicy.description}</div>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                                <div><span className="font-medium">Efecto:</span> {selectedPolicy.effect}</div>
                                <div><span className="font-medium">Tipo:</span> {selectedPolicy.type}</div>
                                <div><span className="font-medium">Prioridad:</span> {selectedPolicy.priority}</div>
                            </div>

                            {/* Rules */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-semibold">Reglas ({policyRules.length})</h4>
                                    <Button size="sm" variant="outline" onClick={() => { setRuleJson('{}'); setRulePriority('1'); setAddRuleOpen(true) }}>
                                        <Plus className="h-4 w-4 mr-1" /> Agregar Regla
                                    </Button>
                                </div>
                                {policyRules.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Sin reglas — el efecto se aplica directamente</p>
                                ) : (
                                    <div className="space-y-2">
                                        {policyRules.map((rule) => (
                                            <div key={rule.id} className="bg-muted/50 px-3 py-2 rounded">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs text-muted-foreground">Prioridad: {rule.priority}</span>
                                                    <Button
                                                        variant="ghost" size="icon" className="h-6 w-6"
                                                        onClick={() => { setDeleteRuleTarget(rule); setDeleteRuleOpen(true) }}
                                                    >
                                                        <X className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                                <pre className="text-xs bg-background p-2 rounded overflow-x-auto">
                                                    {JSON.stringify(rule.condition, null, 2)}
                                                </pre>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Permissions */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-semibold">Permisos asociados ({policyPermissions.length})</h4>
                                    <Button size="sm" variant="outline" onClick={openAddPermission}>
                                        <Plus className="h-4 w-4 mr-1" /> Agregar
                                    </Button>
                                </div>
                                {policyPermissions.length === 0 ? (
                                    <p className="text-sm text-muted-foreground">Sin permisos asociados</p>
                                ) : (
                                    <div className="grid gap-1">
                                        {policyPermissions.map((pp) => (
                                            <div key={pp.id} className="flex items-center justify-between bg-muted/50 px-3 py-2 rounded text-sm">
                                                <span className="font-mono">{pp.permission?.resource}:{pp.permission?.action}</span>
                                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleRemovePermission(pp.permission?.id)}>
                                                    <X className="h-3 w-3" />
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

            {/* Add Rule Dialog */}
            <Dialog open={addRuleOpen} onOpenChange={setAddRuleOpen}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Agregar regla — {selectedPolicy?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Condicion</Label>
                            <ConditionBuilder value={ruleJson} onChange={setRuleJson} />
                        </div>
                        <div className="space-y-2">
                            <Label>Prioridad</Label>
                            <Input type="number" value={rulePriority} onChange={(e) => setRulePriority(e.target.value)} className="w-32" />
                        </div>
                        <div className="flex gap-2 justify-end">
                            <Button variant="outline" onClick={() => setAddRuleOpen(false)}>Cancelar</Button>
                            <Button onClick={handleAddRule}>Agregar regla</Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Add Permission Dialog */}
            <Dialog open={addPermOpen} onOpenChange={setAddPermOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Asociar permiso a: {selectedPolicy?.name}</DialogTitle></DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Permiso</Label>
                            <Select value={selectedPermId} onValueChange={setSelectedPermId}>
                                <SelectTrigger><SelectValue placeholder="Seleccionar permiso" /></SelectTrigger>
                                <SelectContent>
                                    {availablePermissions.map(p => (
                                        <SelectItem key={p.id} value={p.id}>
                                            {p.resource}:{p.action}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleAddPermission} className="w-full" disabled={!selectedPermId}>Asociar</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
