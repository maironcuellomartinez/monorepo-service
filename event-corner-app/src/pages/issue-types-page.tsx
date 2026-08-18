import { useEffect, useState } from 'react'
import {
  Plus, Tag, AlertCircle, Pencil, Trash2,
  Search, X, FolderTree, ChevronRight,
} from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { issueTypesApi, treesApi, DEVICE_TYPES, IssueType, IssueTypeTree } from '@/lib/api'

// ── Catalogs ─────────────────────────────────────────────────────────────────

// Nombres tal cual los usa legacy/backend (IssueCategory) — sin traducir,
// para evitar confusión al correlacionar con sistemas que usan el valor crudo.
const CATEGORIES = ['ISSUE', 'CREATE-DELIVERY', 'CREATE-COLLECTION', 'REQUEST-ONBOARDING', 'REQUEST-DECOMISSION']

// ── Issue type form ───────────────────────────────────────────────────────────

const EMPTY_IT_FORM: Partial<IssueType> = {
  name: '', category: '', deviceType: '',
  servicenowCategory: '', servicenowCloseCategory: '',
  snUrgency: 2, snImpact: 2, snSeverity: 'medium',
  workMinutes: undefined, spareMinutes: undefined, closeMinutes: undefined,
  position: undefined, icon: '',
  notUserVisible: false, npsDisabled: false, isActive: true,
}

// ── Tree form ────────────────────────────────────────────────────────────────

const EMPTY_TREE_FORM = { id: '', name: '' }

// ── Component ────────────────────────────────────────────────────────────────

export function IssueTypesPage() {
  // ─ Trees state
  const [trees, setTrees] = useState<IssueTypeTree[]>([])
  const [selectedTree, setSelectedTree] = useState<IssueTypeTree | null>(null)
  const [treeLoading, setTreeLoading] = useState(true)

  // ─ Issue types state
  const [issueTypes, setIssueTypes] = useState<IssueType[]>([])
  const [itLoading, setItLoading] = useState(false)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // ─ Tree dialog
  const [showTreeDialog, setShowTreeDialog] = useState(false)
  const [editingTreeId, setEditingTreeId] = useState<string | null>(null)
  const [treeForm, setTreeForm] = useState(EMPTY_TREE_FORM)
  const [treeSaving, setTreeSaving] = useState(false)
  const [treeFormError, setTreeFormError] = useState('')
  const [deleteTreeId, setDeleteTreeId] = useState<string | null>(null)

  // ─ Issue type dialog
  const [showItDialog, setShowItDialog] = useState(false)
  const [editingItId, setEditingItId] = useState<string | null>(null)
  const [itForm, setItForm] = useState<Partial<IssueType>>(EMPTY_IT_FORM)
  const [itSaving, setItSaving] = useState(false)
  const [itFormError, setItFormError] = useState('')
  const [deleteItId, setDeleteItId] = useState<string | null>(null)

  // ── Loaders ──────────────────────────────────────────────────────────────

  const loadTrees = async () => {
    setTreeLoading(true)
    try {
      const data = await treesApi.list()
      setTrees(data)
      // Auto-select first tree if none selected
      setSelectedTree((prev) => prev ?? data[0] ?? null)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al cargar árboles')
    } finally {
      setTreeLoading(false)
    }
  }

  const loadIssueTypes = async (treeId?: string) => {
    setItLoading(true)
    setError('')
    try {
      const data = await issueTypesApi.list(treeId ? { treeId } : undefined)
      setIssueTypes(data)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al cargar tipos de cita')
    } finally {
      setItLoading(false)
    }
  }

  useEffect(() => { loadTrees() }, [])

  useEffect(() => {
    loadIssueTypes(selectedTree?.id)
    setSearch('')
  }, [selectedTree?.id])

  const refresh = () => {
    loadTrees()
    loadIssueTypes(selectedTree?.id)
  }

  // ── Tree dialog handlers ──────────────────────────────────────────────────

  const openCreateTree = () => {
    setEditingTreeId(null)
    setTreeForm(EMPTY_TREE_FORM)
    setTreeFormError('')
    setShowTreeDialog(true)
  }

  const openRenameTree = (t: IssueTypeTree) => {
    setEditingTreeId(t.id)
    setTreeForm({ id: t.id, name: t.name })
    setTreeFormError('')
    setShowTreeDialog(true)
  }

  const handleSaveTree = async () => {
    if (!treeForm.name.trim()) { setTreeFormError('El nombre es obligatorio'); return }
    if (!editingTreeId && !treeForm.id.trim()) { setTreeFormError('El ID es obligatorio'); return }
    setTreeSaving(true)
    setTreeFormError('')
    try {
      if (editingTreeId) {
        const updated = await treesApi.rename(editingTreeId, treeForm.name)
        setSelectedTree((prev) => prev?.id === editingTreeId ? updated : prev)
      } else {
        const created = await treesApi.create({ id: treeForm.id.trim(), name: treeForm.name })
        setSelectedTree(created)
      }
      setShowTreeDialog(false)
      await loadTrees()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setTreeFormError(msg || 'Error al guardar árbol')
    } finally {
      setTreeSaving(false)
    }
  }

  const handleDeleteTree = async (id: string) => {
    try {
      await treesApi.remove(id)
      setDeleteTreeId(null)
      if (selectedTree?.id === id) setSelectedTree(null)
      await loadTrees()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al eliminar árbol')
    }
  }

  // ── Issue type dialog handlers ────────────────────────────────────────────

  const openCreateIt = () => {
    setEditingItId(null)
    setItForm({ ...EMPTY_IT_FORM, treeId: selectedTree?.id })
    setItFormError('')
    setShowItDialog(true)
  }

  const openEditIt = (it: IssueType) => {
    setEditingItId(it.id)
    setItForm({
      name: it.name, category: it.category ?? '',
      deviceType: it.deviceType ?? '',
      servicenowCategory: it.servicenowCategory ?? '',
      servicenowCloseCategory: it.servicenowCloseCategory ?? '',
      snUrgency: it.snUrgency ?? 2, snImpact: it.snImpact ?? 2, snSeverity: it.snSeverity ?? 'medium',
      workMinutes: it.workMinutes, spareMinutes: it.spareMinutes, closeMinutes: it.closeMinutes,
      position: it.position, icon: it.icon ?? '',
      notUserVisible: it.notUserVisible ?? false,
      npsDisabled: it.npsDisabled ?? false,
      isActive: it.isActive ?? true,
      treeId: it.treeId ?? selectedTree?.id,
    })
    setItFormError('')
    setShowItDialog(true)
  }

  const setItField = <K extends keyof IssueType>(key: K, value: IssueType[K]) =>
    setItForm((p) => ({ ...p, [key]: value }))

  const handleSaveIt = async () => {
    if (!itForm.name?.trim()) { setItFormError('El nombre es obligatorio'); return }
    if (!itForm.category) { setItFormError('La categoría es obligatoria'); return }
    if (!itForm.workMinutes || itForm.workMinutes <= 0) { setItFormError('Min Entrega debe ser mayor a 0'); return }
    setItSaving(true)
    setItFormError('')
    try {
      const payload = { ...itForm, treeId: selectedTree?.id }
      if (editingItId) {
        await issueTypesApi.update(editingItId, payload)
      } else {
        await issueTypesApi.create(payload)
      }
      setShowItDialog(false)
      await loadIssueTypes(selectedTree?.id)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setItFormError(msg || 'Error al guardar')
    } finally {
      setItSaving(false)
    }
  }

  const handleDeleteIt = async (id: string) => {
    try {
      await issueTypesApi.remove(id)
      setDeleteItId(null)
      await loadIssueTypes(selectedTree?.id)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al eliminar tipo de cita')
    }
  }

  // ── Filtered issue types ──────────────────────────────────────────────────

  const categoryLabel = (value?: string) => value ?? '—'

  const filtered = search.trim()
    ? issueTypes.filter((it) => {
        const q = search.toLowerCase()
        return (
          it.name.toLowerCase().includes(q) ||
          (it.deviceType ?? '').toLowerCase().includes(q) ||
          categoryLabel(it.category).toLowerCase().includes(q)
        )
      })
    : issueTypes

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <Header title="Tipos de Citas" icon={Tag} onRefresh={refresh} loading={treeLoading || itLoading} />

      {error && (
        <div className="px-6 pt-3">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Trees panel ──────────────────────────────────────────── */}
        <aside className="w-64 shrink-0 border-r flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Grupos
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={openCreateTree} title="Nuevo grupo">
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {treeLoading ? (
              <div className="space-y-1 p-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-9 bg-muted animate-pulse rounded" />)}
              </div>
            ) : trees.length === 0 ? (
              <div className="p-4 text-center">
                <FolderTree className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Sin grupos</p>
                <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={openCreateTree}>
                  Crear grupo
                </Button>
              </div>
            ) : (
              trees.map((t) => (
                <div
                  key={t.id}
                  className={`flex items-center gap-2 px-3 py-2 mx-1 rounded cursor-pointer group text-sm transition-colors ${
                    selectedTree?.id === t.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted'
                  }`}
                  onClick={() => setSelectedTree(t)}
                >
                  <FolderTree className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate font-mono text-xs">{t.id}</span>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 shrink-0">
                    <button
                      className="p-0.5 rounded hover:bg-black/10"
                      onClick={(e) => { e.stopPropagation(); openRenameTree(t) }}
                      title="Renombrar"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      className="p-0.5 rounded hover:bg-black/10"
                      onClick={(e) => { e.stopPropagation(); setDeleteTreeId(t.id) }}
                      title="Eliminar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>

        {/* ── Right: Issue types panel ────────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">

          {/* Sub-header */}
          <div className="flex items-center justify-between px-4 py-3 border-b gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {selectedTree ? (
                <>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{selectedTree.name}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">{selectedTree.id}</p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Selecciona un grupo</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="pl-8 pr-7 w-52 h-8 text-sm"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Button size="sm" onClick={openCreateIt} disabled={!selectedTree}>
                <Plus className="h-4 w-4" />
                Nuevo Tipo
              </Button>
            </div>
          </div>

          {/* Table */}
          <div className="flex-1 overflow-auto p-4">
            {!selectedTree ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <FolderTree className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">Selecciona un grupo para ver sus tipos de cita</p>
              </div>
            ) : itLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}
              </div>
            ) : issueTypes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Tag className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">No hay tipos de cita en este grupo</p>
                <Button className="mt-3" size="sm" onClick={openCreateIt}>
                  <Plus className="h-4 w-4" />
                  Crear primero
                </Button>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Search className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-muted-foreground text-sm">Sin resultados para "{search}"</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSearch('')}>Limpiar</Button>
              </div>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Categoría</TableHead>
                      <TableHead>Tipo Dispositivo</TableHead>
                      <TableHead className="text-center">Min Entrega</TableHead>
                      <TableHead className="text-center">Min Repuesto</TableHead>
                      <TableHead className="text-center">Min Cierre</TableHead>
                      <TableHead>Categ. SN</TableHead>
                      <TableHead>Cierre SN</TableHead>
                      <TableHead>Visible</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell className="font-medium">{it.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs font-mono">
                            {categoryLabel(it.category)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{it.deviceType ?? '—'}</TableCell>
                        <TableCell className="text-sm text-center">{it.workMinutes ?? '—'}</TableCell>
                        <TableCell className="text-sm text-center">{it.spareMinutes ?? '—'}</TableCell>
                        <TableCell className="text-sm text-center">{it.closeMinutes ?? '—'}</TableCell>
                        <TableCell className="text-xs font-mono">{it.servicenowCategory ?? '—'}</TableCell>
                        <TableCell className="text-xs font-mono">{it.servicenowCloseCategory ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={!it.notUserVisible ? 'default' : 'secondary'}>
                            {!it.notUserVisible ? 'Sí' : 'No'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={it.isActive !== false ? 'default' : 'secondary'}>
                            {it.isActive !== false ? 'Activo' : 'Inactivo'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditIt(it)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => setDeleteItId(it.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* ── Tree dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={showTreeDialog} onOpenChange={setShowTreeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingTreeId ? 'Renombrar grupo' : 'Nuevo grupo de tipos de cita'}</DialogTitle>
            <DialogDescription>
              Los grupos organizan los tipos de cita por compañía o configuración.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {!editingTreeId && (
              <div className="space-y-2">
                <Label>ID del grupo *</Label>
                <Input
                  value={treeForm.id}
                  onChange={(e) => setTreeForm((p) => ({ ...p, id: e.target.value }))}
                  placeholder="tree-santander-0000000000000001"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Ejemplos: DEFAULT · tree-santander-0000000000000001 · tree-bgt-0000000000000002
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={treeForm.name}
                onChange={(e) => setTreeForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="Santander Corporate"
              />
            </div>
          </div>
          {treeFormError && (
            <Alert variant="destructive"><AlertDescription>{treeFormError}</AlertDescription></Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTreeDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveTree} disabled={treeSaving}>
              {treeSaving ? 'Guardando...' : editingTreeId ? 'Renombrar' : 'Crear grupo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete tree confirm ──────────────────────────────────────────────── */}
      <Dialog open={!!deleteTreeId} onOpenChange={(o) => !o && setDeleteTreeId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar grupo</DialogTitle>
            <DialogDescription>
              Solo puedes eliminar grupos sin tipos de cita asignados. Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTreeId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteTreeId && handleDeleteTree(deleteTreeId)}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Issue type create/edit dialog ──────────────────────────────────── */}
      <Dialog open={showItDialog} onOpenChange={setShowItDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItId ? 'Editar tipo de cita' : 'Nuevo tipo de cita'}</DialogTitle>
            <DialogDescription>
              Grupo: <span className="font-mono text-xs">{selectedTree?.id}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={itForm.name ?? ''} onChange={(e) => setItField('name', e.target.value)} placeholder="Problema con teclado" />
            </div>
            <div className="space-y-2">
              <Label>Categoría *</Label>
              <Select value={itForm.category ?? ''} onValueChange={(v) => setItField('category', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar categoría" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de dispositivo</Label>
              <Select value={itForm.deviceType ?? ''} onValueChange={(v) => setItField('deviceType', v)}>
                <SelectTrigger><SelectValue placeholder="Seleccionar tipo de dispositivo" /></SelectTrigger>
                <SelectContent>
                  {DEVICE_TYPES.map((dt) => <SelectItem key={dt} value={dt}>{dt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Min Entrega *</Label>
                <Input type="number" min={1} value={itForm.workMinutes ?? ''}
                  onChange={(e) => setItField('workMinutes', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="60" />
              </div>
              <div className="space-y-2">
                <Label>Min Repuesto</Label>
                <Input type="number" min={0} value={itForm.spareMinutes ?? ''}
                  onChange={(e) => setItField('spareMinutes', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="15" />
              </div>
              <div className="space-y-2">
                <Label>Min Cierre</Label>
                <Input type="number" min={0} value={itForm.closeMinutes ?? ''}
                  onChange={(e) => setItField('closeMinutes', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="10" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>ServiceNow Category</Label>
                <Input value={itForm.servicenowCategory ?? ''}
                  onChange={(e) => setItField('servicenowCategory', e.target.value)} placeholder="hardware" />
              </div>
              <div className="space-y-2">
                <Label>ServiceNow Close</Label>
                <Input value={itForm.servicenowCloseCategory ?? ''}
                  onChange={(e) => setItField('servicenowCloseCategory', e.target.value)} placeholder="Hardware Failure" />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>SN Urgencia</Label>
                <Select value={String(itForm.snUrgency ?? 2)} onValueChange={(v) => setItField('snUrgency', Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 — Alta</SelectItem>
                    <SelectItem value="2">2 — Media</SelectItem>
                    <SelectItem value="3">3 — Baja</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>SN Impacto</Label>
                <Select value={String(itForm.snImpact ?? 2)} onValueChange={(v) => setItField('snImpact', Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 — Alto</SelectItem>
                    <SelectItem value="2">2 — Medio</SelectItem>
                    <SelectItem value="3">3 — Bajo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>SN Severidad</Label>
                <Select value={itForm.snSeverity ?? 'medium'} onValueChange={(v) => setItField('snSeverity', v as IssueType['snSeverity'])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Posición</Label>
                <Input type="number" min={0} value={itForm.position ?? ''}
                  onChange={(e) => setItField('position', e.target.value ? Number(e.target.value) : undefined)}
                  placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Icono</Label>
                <Input value={itForm.icon ?? ''}
                  onChange={(e) => setItField('icon', e.target.value)} placeholder="keyboard" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={itForm.notUserVisible ?? false}
                  onChange={(e) => setItField('notUserVisible', e.target.checked)}
                  className="h-4 w-4 rounded border-input" />
                <span className="text-sm">Oculto para usuarios</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={itForm.npsDisabled ?? false}
                  onChange={(e) => setItField('npsDisabled', e.target.checked)}
                  className="h-4 w-4 rounded border-input" />
                <span className="text-sm">NPS deshabilitado</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={itForm.isActive ?? true}
                  onChange={(e) => setItField('isActive', e.target.checked)}
                  className="h-4 w-4 rounded border-input" />
                <span className="text-sm">Activo</span>
              </label>
            </div>
          </div>
          {itFormError && (
            <Alert variant="destructive"><AlertDescription>{itFormError}</AlertDescription></Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowItDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveIt} disabled={itSaving}>
              {itSaving ? 'Guardando...' : editingItId ? 'Guardar cambios' : 'Crear tipo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete issue type confirm ────────────────────────────────────────── */}
      <Dialog open={!!deleteItId} onOpenChange={(o) => !o && setDeleteItId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar eliminación</DialogTitle>
            <DialogDescription>El tipo de cita será eliminado permanentemente.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteItId && handleDeleteIt(deleteItId)}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
