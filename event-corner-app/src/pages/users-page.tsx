import { useEffect, useState, useMemo, useCallback } from 'react'
import {
  Plus, Users, UserCheck, AlertCircle, Search, CheckCircle2,
  Trash2, ToggleLeft, ToggleRight, Building2, Pencil, Copy, Check,
} from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  techniciansApi, cornersApi, usersApi, companiesApi,
  TechnicianProfile, MonolithUser, Corner, Company,
} from '@/lib/api'
import { cn } from '@/lib/utils'

// ─── CopyableId ───────────────────────────────────────────────────────────────

function CopyableId({ value }: { value: string | null | undefined }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    if (!value) return
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [value])

  if (!value) return <span className="text-muted-foreground">—</span>

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copiar al portapapeles"
      className="group flex items-center gap-1 text-xs text-muted-foreground font-mono hover:text-foreground transition-colors"
    >
      <span className="max-w-[120px] truncate">{value}</span>
      {copied
        ? <Check className="h-3 w-3 text-green-500 flex-shrink-0" />
        : <Copy className="h-3 w-3 opacity-0 group-hover:opacity-100 flex-shrink-0 transition-opacity" />
      }
    </button>
  )
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const [users, setUsers] = useState<MonolithUser[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  // Edit dialog
  const [editTarget, setEditTarget] = useState<MonolithUser | null>(null)
  const [editName, setEditName] = useState('')
  const [editLastName, setEditLastName] = useState('')
  const [editCompanyId, setEditCompanyId] = useState<string>('none')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<MonolithUser | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [u, c] = await Promise.all([usersApi.listAll(), companiesApi.list()])
      setUsers(u)
      setCompanies(c)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al cargar usuarios')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.fullName?.toLowerCase().includes(q) ||
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.principalName?.toLowerCase().includes(q),
    )
  }, [users, search])

  const openEdit = (u: MonolithUser) => {
    setEditTarget(u)
    setEditName(u.name ?? '')
    setEditLastName(u.lastName ?? '')
    setEditCompanyId(u.companyId ?? 'none')
    setSaveError('')
  }

  const handleSave = async () => {
    if (!editTarget) return
    setSaving(true)
    setSaveError('')
    try {
      await usersApi.update(editTarget.id, {
        name: editName || undefined,
        lastName: editLastName || undefined,
        companyId: editCompanyId === 'none' ? null : editCompanyId,
      })
      setEditTarget(null)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setSaveError(msg || 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async (u: MonolithUser) => {
    try {
      if (u.isActive) {
        await usersApi.deactivate(u.id)
      } else {
        await usersApi.activate(u.id)
      }
      await load()
    } catch { /* silencioso */ }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    try {
      await usersApi.remove(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setDeleteError(msg || 'Error al eliminar')
    } finally {
      setDeleting(false)
    }
  }

  const getCompanyName = (companyId: string | null) =>
    companyId ? (companies.find((c) => c.id === companyId)?.name ?? companyId) : null

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre o email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Users className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No hay usuarios registrados</p>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>External ID</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-32">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((u) => {
                const companyName = getCompanyName(u.companyId)
                return (
                  <TableRow key={u.id} className={!u.isActive ? 'opacity-50' : ''}>
                    <TableCell className="font-medium">
                      {u.fullName ?? (`${u.name ?? ''} ${u.lastName ?? ''}`.trim() || '—')}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.email ?? u.principalName ?? '—'}
                    </TableCell>
                    <TableCell>
                      {companyName ? (
                        <div className="flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm">{companyName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-amber-600 font-medium">Sin empresa</span>
                      )}
                    </TableCell>
                    <TableCell><CopyableId value={u.id} /></TableCell>
                    <TableCell><CopyableId value={u.externalId} /></TableCell>
                    <TableCell>
                      <Badge variant={u.isActive ? 'default' : 'secondary'}>
                        {u.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Editar usuario"
                          onClick={() => openEdit(u)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn('h-8 w-8', u.isActive ? 'text-amber-600 hover:text-amber-700' : 'text-green-600 hover:text-green-700')}
                          title={u.isActive ? 'Deshabilitar' : 'Habilitar'}
                          onClick={() => handleToggle(u)}
                        >
                          {u.isActive ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          title="Eliminar usuario"
                          onClick={() => { setDeleteError(''); setDeleteTarget(u) }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>
              {editTarget?.email ?? editTarget?.principalName ?? '—'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nombre</label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Nombre" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Apellido</label>
              <Input value={editLastName} onChange={(e) => setEditLastName(e.target.value)} placeholder="Apellido" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Empresa</label>
              <Select value={editCompanyId} onValueChange={setEditCompanyId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar empresa..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">
                    <span className="text-muted-foreground">Sin empresa</span>
                  </SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {saveError && (
            <Alert variant="destructive"><AlertDescription>{saveError}</AlertDescription></Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar usuario</DialogTitle>
            <DialogDescription>
              ¿Seguro que deseas eliminar a{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.fullName ?? deleteTarget?.email ?? '—'}
              </span>
              ? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <Alert variant="destructive"><AlertDescription>{deleteError}</AlertDescription></Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Technicians Tab ──────────────────────────────────────────────────────────

function TechniciansTab() {
  const [technicians, setTechnicians] = useState<TechnicianProfile[]>([])
  const [corners, setCorners] = useState<Corner[]>([])
  const [allUsers, setAllUsers] = useState<MonolithUser[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<TechnicianProfile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const [showDialog, setShowDialog] = useState(false)
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<MonolithUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [techs, cors] = await Promise.all([techniciansApi.list(), cornersApi.list()])
      setTechnicians(techs)
      setCorners(cors)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al cargar técnicos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openCreate = async () => {
    setSearch('')
    setSelectedUser(null)
    setFormError('')
    setShowDialog(true)
    setLoadingUsers(true)
    setUsersError('')
    try {
      const all = await usersApi.listAll()
      const techUserIds = new Set(technicians.map((t) => t.userId).filter(Boolean))
      setAllUsers(all.filter((u) => !techUserIds.has(u.id)))
    } catch {
      setUsersError('No se pudo cargar la lista de usuarios.')
    } finally {
      setLoadingUsers(false)
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return allUsers
    return allUsers.filter(
      (u) =>
        u.fullName?.toLowerCase().includes(q) ||
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q),
    )
  }, [allUsers, search])

  const handleCreate = async () => {
    if (!selectedUser) return
    setSaving(true)
    setFormError('')
    try {
      await techniciansApi.create({
        userId: selectedUser.id,
        name: selectedUser.name ?? selectedUser.email ?? '',
        lastName: selectedUser.lastName ?? undefined,
        email: selectedUser.email ?? '',
      })
      setShowDialog(false)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setFormError(msg || 'Error al crear el técnico')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    setDeleteError('')
    try {
      await techniciansApi.remove(deleteTarget.id)
      setDeleteTarget(null)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setDeleteError(msg || 'Error al eliminar el técnico')
    } finally {
      setDeleting(false)
    }
  }

  const handleToggle = async (tech: TechnicianProfile) => {
    try {
      if (tech.disabled) {
        await techniciansApi.enable(tech.id)
      } else {
        await techniciansApi.disable(tech.id)
      }
      await load()
    } catch { /* silencioso */ }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo técnico
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />)}
        </div>
      ) : technicians.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <UserCheck className="h-10 w-10 text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No hay técnicos registrados</p>
          <Button className="mt-4" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Crear primer técnico
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Corner</TableHead>
                <TableHead>ID</TableHead>
                <TableHead>User ID</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-28">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {technicians.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    {t.fullName ?? `${t.name}${t.lastName ? ' ' + t.lastName : ''}`}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{t.email}</TableCell>
                  <TableCell className="text-sm">
                    {t.cornerId ? (
                      <span>{corners.find((c) => c.id === t.cornerId)?.name ?? t.cornerId}</span>
                    ) : (
                      <span className="text-muted-foreground italic">Sin asignar</span>
                    )}
                  </TableCell>
                  <TableCell><CopyableId value={t.id} /></TableCell>
                  <TableCell><CopyableId value={t.userId} /></TableCell>
                  <TableCell>
                    <Badge variant={t.disabled ? 'secondary' : 'default'}>
                      {t.disabled ? 'Deshabilitado' : 'Activo'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn('h-8 w-8', t.disabled ? 'text-green-600 hover:text-green-700' : 'text-amber-600 hover:text-amber-700')}
                        title={t.disabled ? 'Habilitar' : 'Deshabilitar'}
                        onClick={() => handleToggle(t)}
                      >
                        {t.disabled ? <ToggleLeft className="h-5 w-5" /> : <ToggleRight className="h-5 w-5" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        title="Eliminar técnico"
                        onClick={() => { setDeleteError(''); setDeleteTarget(t) }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete confirm */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Quitar de técnicos</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">
                {deleteTarget?.fullName ?? deleteTarget?.name}
              </span>{' '}
              será removido como técnico y volverá a ser un usuario normal. Su cuenta no se elimina.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <Alert variant="destructive"><AlertDescription>{deleteError}</AlertDescription></Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Procesando...' : 'Quitar de técnicos'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo técnico</DialogTitle>
            <DialogDescription>
              Selecciona un usuario para registrarlo como técnico.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="border rounded-md overflow-hidden max-h-64 overflow-y-auto">
            {loadingUsers ? (
              <div className="space-y-1 p-2">
                {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
              </div>
            ) : usersError ? (
              <p className="text-sm text-destructive p-4">{usersError}</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">
                {search ? 'Sin resultados.' : 'No hay usuarios disponibles.'}
              </p>
            ) : (
              filtered.map((u) => {
                const isSelected = selectedUser?.id === u.id
                const displayName = u.fullName || `${u.name ?? ''} ${u.lastName ?? ''}`.trim() || u.email || u.id
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setSelectedUser(isSelected ? null : u)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-b last:border-b-0',
                      isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted',
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{displayName}</p>
                      {u.email && displayName !== u.email && (
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      )}
                    </div>
                    {isSelected && <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-primary" />}
                  </button>
                )
              })
            )}
          </div>

          {formError && (
            <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving || !selectedUser}>
              {saving ? 'Creando...' : 'Crear técnico'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function UsersPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Usuarios" />
      <div className="flex-1 p-6 overflow-auto">
        <Tabs defaultValue="users">
          <TabsList className="mb-6">
            <TabsTrigger value="users" className="gap-2">
              <Users className="h-4 w-4" />
              Usuarios
            </TabsTrigger>
            <TabsTrigger value="technicians" className="gap-2">
              <UserCheck className="h-4 w-4" />
              Técnicos
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users">
            <UsersTab />
          </TabsContent>

          <TabsContent value="technicians">
            <TechniciansTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
