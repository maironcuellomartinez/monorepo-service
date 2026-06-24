import { useEffect, useState, useMemo } from 'react'
import { Plus, Users, AlertCircle, Search, CheckCircle2, Trash2, ToggleLeft, ToggleRight } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { techniciansApi, cornersApi, usersApi, TechnicianProfile, MonolithUser, Corner } from '@/lib/api'
import { cn } from '@/lib/utils'

export function TechniciansPage() {
  const [technicians, setTechnicians] = useState<TechnicianProfile[]>([])
  const [corners, setCorners] = useState<Corner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // Delete confirm dialog
  const [deleteTarget, setDeleteTarget] = useState<TechnicianProfile | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Create dialog
  const [showDialog, setShowDialog] = useState(false)
  const [users, setUsers] = useState<MonolithUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(false)
  const [usersError, setUsersError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<MonolithUser | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // ── Load technicians ───────────────────────────────────────────────────────

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

  // ── Open dialog ────────────────────────────────────────────────────────────

  const openCreate = async () => {
    setSearch('')
    setSelectedUser(null)
    setFormError('')
    setShowDialog(true)
    setLoadingUsers(true)
    setUsersError('')
    try {
      const all = await usersApi.list()
      // Excluir usuarios que ya son técnicos activos
      const techUserIds = new Set(technicians.map((t) => t.userId).filter(Boolean))
      setUsers(all.filter((u) => !techUserIds.has(u.id)))
    } catch {
      setUsersError('No se pudo cargar la lista de usuarios.')
    } finally {
      setLoadingUsers(false)
    }
  }

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      (u) =>
        u.fullName?.toLowerCase().includes(q) ||
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q),
    )
  }, [users, search])

  // ── Create ─────────────────────────────────────────────────────────────────

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

  // ── Delete ─────────────────────────────────────────────────────────────────

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

  // ── Toggle ─────────────────────────────────────────────────────────────────

  const handleToggle = async (tech: TechnicianProfile) => {
    try {
      if (tech.disabled) {
        await techniciansApi.enable(tech.id)
      } else {
        await techniciansApi.disable(tech.id)
      }
      await load()
    } catch {
      // silencioso
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <Header title="Técnicos" onRefresh={load} loading={loading}>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nuevo técnico
        </Button>
      </Header>

      <div className="flex-1 p-6 overflow-auto">
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : technicians.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <Users className="h-10 w-10 text-muted-foreground mb-4" />
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
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-36">Acciones</TableHead>
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
      </div>

      {/* ── Delete confirm dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar técnico</DialogTitle>
            <DialogDescription>
              ¿Seguro que deseas eliminar a{' '}
              <span className="font-medium text-foreground">
                {deleteTarget?.fullName ?? deleteTarget?.name}
              </span>
              ? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <Alert variant="destructive">
              <AlertDescription>{deleteError}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Eliminando...' : 'Eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create dialog ───────────────────────────────────────────────────────── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuevo técnico</DialogTitle>
            <DialogDescription>
              Selecciona un usuario para registrarlo como técnico. El corner se asigna desde la sección Corners.
            </DialogDescription>
          </DialogHeader>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Buscar por nombre o email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* User list */}
          <div className="border rounded-md overflow-hidden max-h-72 overflow-y-auto">
            {loadingUsers ? (
              <div className="space-y-1 p-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-10 bg-muted animate-pulse rounded" />
                ))}
              </div>
            ) : usersError ? (
              <p className="text-sm text-destructive p-4">{usersError}</p>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4 text-center">
                {search ? 'Sin resultados para esa búsqueda.' : 'No hay usuarios disponibles.'}
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
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-muted',
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

          {selectedUser && (
            <p className="text-xs text-muted-foreground">
              Seleccionado:{' '}
              <span className="font-medium text-foreground">
                {selectedUser.fullName || selectedUser.name || selectedUser.email}
              </span>
            </p>
          )}

          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
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
