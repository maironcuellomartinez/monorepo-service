import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Cpu,
  RefreshCw,
  Search,
  User,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
  Box,
  WifiOff,
  Plus,
  Trash2,
  Pencil,
  Ban,
  CircleCheck,
} from 'lucide-react'
import { devicesApi, usersApi, DEVICE_TYPES, type DeviceSummary, type MonolithUser } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'

// ─── Status helpers ──────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; variant: string; icon: React.ElementType }> = {
  SYNCED:   { label: 'Sincronizado',   variant: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',   icon: CheckCircle2 },
  STALE:    { label: 'Desactualizado', variant: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400', icon: Clock },
  SYNC_ERROR:{ label: 'Error Sync',   variant: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',             icon: AlertTriangle },
  NOT_FOUND:{ label: 'No encontrado',  variant: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',           icon: XCircle },
  VIRTUAL:  { label: 'Virtual',        variant: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',        icon: Box },
  DISABLED: { label: 'Deshabilitado',  variant: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',       icon: Ban },
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, variant: 'bg-gray-100 text-gray-600', icon: WifiOff }
  const Icon = cfg.icon
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', cfg.variant)}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  )
}

function extractError(err: unknown): string {
  return (err as { response?: { data?: { message?: string } } })?.response?.data?.message
    ?? (err as Error)?.message
    ?? 'Error inesperado'
}

// ─── Virtual Device Form ──────────────────────────────────────────────────────

interface VirtualDeviceFormValues {
  serialNumber: string
  deviceType: string
  model: string
  brand: string
}

interface VirtualDeviceDialogProps {
  open: boolean
  onClose: () => void
  onSaved: (device: DeviceSummary) => void
  userId: string
  /** When editing, pass the existing device */
  editing?: DeviceSummary
}

function VirtualDeviceDialog({ open, onClose, onSaved, userId, editing }: VirtualDeviceDialogProps) {
  const isEdit = !!editing

  const [form, setForm] = useState<VirtualDeviceFormValues>({
    serialNumber: '',
    deviceType: '',
    model: '',
    brand: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Reset form when dialog opens/changes target
  useEffect(() => {
    if (open) {
      setForm({
        serialNumber: editing?.serialNumber ?? '',
        deviceType: editing?.deviceType ?? '',
        model: editing?.model ?? '',
        brand: editing?.brand ?? '',
      })
      setError('')
    }
  }, [open, editing])

  const handleClose = () => {
    setSaving(false)
    setError('')
    onClose()
  }

  const set = (key: keyof VirtualDeviceFormValues) => (val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }))

  const handleSubmit = async () => {
    if (!form.deviceType) { setError('Seleccioná un tipo de dispositivo'); return }
    setSaving(true)
    setError('')
    try {
      let device: DeviceSummary
      if (isEdit && editing) {
        device = await devicesApi.updateVirtual(editing.id, {
          serialNumber: form.serialNumber || undefined,
          deviceType: form.deviceType || undefined,
          model: form.model || null,
          brand: form.brand || null,
        })
      } else {
        device = await devicesApi.createVirtual(
          userId,
          form.deviceType,
          form.model || undefined,
          form.serialNumber || undefined,
        )
      }
      onSaved(device)
      handleClose()
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar dispositivo virtual' : 'Crear dispositivo virtual'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Tipo de dispositivo <span className="text-destructive">*</span></Label>
            <Select value={form.deviceType} onValueChange={set('deviceType')}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccioná un tipo…" />
              </SelectTrigger>
              <SelectContent>
                {DEVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>
              Número de serie
              <span className="text-muted-foreground text-xs ml-1">(opcional — se genera automáticamente si no se ingresa)</span>
            </Label>
            <Input
              placeholder="ej: SN-2024-001"
              value={form.serialNumber}
              onChange={(e) => set('serialNumber')(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Modelo <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input
                placeholder="ej: EliteBook 840"
                value={form.model}
                onChange={(e) => set('model')(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Marca <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input
                placeholder="ej: HP"
                value={form.brand}
                onChange={(e) => set('brand')(e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={saving}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving || !form.deviceType}>
            {saving ? (isEdit ? 'Guardando…' : 'Creando…') : (isEdit ? 'Guardar' : 'Crear')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export function DevicesPage() {
  const [users, setUsers] = useState<MonolithUser[]>([])
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [userSearch, setUserSearch] = useState('')
  const [selectedUser, setSelectedUser] = useState<MonolithUser | null>(null)

  const [devices, setDevices] = useState<DeviceSummary[]>([])
  const [loadingDevices, setLoadingDevices] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; errors: number } | null>(null)
  const [error, setError] = useState('')

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingDevice, setEditingDevice] = useState<DeviceSummary | undefined>()

  // Row-action state
  const [disablingId, setDisablingId] = useState<string | null>(null)
  const [enablingId, setEnablingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    usersApi.listAll()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setLoadingUsers(false))
  }, [])

  const loadDevices = useCallback(async (userId: string) => {
    setLoadingDevices(true)
    setError('')
    setSyncResult(null)
    try {
      setDevices(await devicesApi.listByUser(userId))
    } catch (err) {
      setError(extractError(err))
      setDevices([])
    } finally {
      setLoadingDevices(false)
    }
  }, [])

  useEffect(() => {
    if (!selectedUser) { setDevices([]); setError(''); setSyncResult(null); return }
    loadDevices(selectedUser.id)
  }, [selectedUser, loadDevices])

  const handleSync = async () => {
    if (!selectedUser) return
    setSyncing(true); setSyncResult(null); setError('')
    try {
      const result = await devicesApi.syncForUser(selectedUser.id)
      setSyncResult(result)
      await loadDevices(selectedUser.id)
    } catch (err) {
      setError(extractError(err))
    } finally {
      setSyncing(false)
    }
  }

  const openCreate = () => { setEditingDevice(undefined); setDialogOpen(true) }
  const openEdit = (d: DeviceSummary) => { setEditingDevice(d); setDialogOpen(true) }

  const handleSaved = (device: DeviceSummary) => {
    setDevices((prev) => {
      const idx = prev.findIndex((d) => d.id === device.id)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = device
        return next
      }
      return [device, ...prev]
    })
  }

  const handleDisable = async (deviceId: string) => {
    setDisablingId(deviceId)
    try {
      await devicesApi.disableDevice(deviceId)
      setDevices((prev) => prev.map((d) => d.id === deviceId ? { ...d, status: 'DISABLED' } : d))
    } catch (err) {
      setError(extractError(err))
    } finally {
      setDisablingId(null)
    }
  }

  const handleEnable = async (device: DeviceSummary) => {
    setEnablingId(device.id)
    try {
      await devicesApi.enableDevice(device.id)
      const restoredStatus = device.isVirtual ? 'VIRTUAL' : 'STALE'
      setDevices((prev) => prev.map((d) => d.id === device.id ? { ...d, status: restoredStatus } : d))
    } catch (err) {
      setError(extractError(err))
    } finally {
      setEnablingId(null)
    }
  }

  const handleDelete = async (deviceId: string) => {
    setDeletingId(deviceId)
    try {
      await devicesApi.deleteVirtual(deviceId)
      setDevices((prev) => prev.filter((d) => d.id !== deviceId))
    } catch (err) {
      setError(extractError(err))
    } finally {
      setDeletingId(null)
    }
  }

  const filteredUsers = useMemo(() => {
    const q = userSearch.toLowerCase().trim()
    if (!q) return users
    return users.filter((u) =>
      u.fullName?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.id?.toLowerCase().includes(q),
    )
  }, [users, userSearch])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Dispositivos</h1>
          {selectedUser && (
            <span className="text-sm text-muted-foreground">
              — {selectedUser.fullName ?? selectedUser.email}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {syncResult && (
            <span className="text-xs text-muted-foreground">
              Sincronizados: <strong>{syncResult.synced}</strong>
              {syncResult.errors > 0 && (
                <span className="text-destructive"> · Errores: <strong>{syncResult.errors}</strong></span>
              )}
            </span>
          )}
          <Button size="sm" variant="outline" onClick={openCreate} disabled={!selectedUser}>
            <Plus className="w-4 h-4 mr-1.5" />
            Virtual
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSync}
            disabled={!selectedUser || syncing || loadingDevices}
          >
            <RefreshCw className={cn('w-4 h-4 mr-1.5', syncing && 'animate-spin')} />
            {syncing ? 'Sincronizando…' : 'Sync Minerva'}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: user picker */}
        <aside className="w-64 flex-shrink-0 border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder="Buscar usuario…"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingUsers ? (
              <div className="p-3 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
                ))}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">Sin resultados</div>
            ) : (
              filteredUsers.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className={cn(
                    'w-full text-left px-3 py-2.5 border-b border-border/50 hover:bg-accent transition-colors',
                    selectedUser?.id === u.id && 'bg-primary/10 border-l-2 border-l-primary',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <User className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate leading-tight">{u.fullName ?? u.name ?? '—'}</p>
                      <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        {/* Right: devices table */}
        <div className="flex-1 overflow-auto p-6">
          {!selectedUser ? (
            <div className="flex flex-col items-center justify-center h-full text-center gap-3">
              <Cpu className="w-12 h-12 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">Seleccioná un usuario para ver sus dispositivos</p>
            </div>
          ) : loadingDevices ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 rounded-md bg-muted animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          ) : devices.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <WifiOff className="w-10 h-10 text-muted-foreground/30" />
              <p className="text-muted-foreground text-sm">No hay dispositivos registrados para este usuario</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleSync} disabled={syncing}>
                  <RefreshCw className={cn('w-4 h-4 mr-1.5', syncing && 'animate-spin')} />
                  Sincronizar desde Minerva
                </Button>
                <Button size="sm" variant="outline" onClick={openCreate}>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Crear virtual
                </Button>
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>Marca</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-24 text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {devices.map((d) => (
                  <TableRow key={d.id} className={d.status === 'DISABLED' ? 'opacity-50' : ''}>
                    <TableCell className="font-mono text-xs">{d.serialNumber}</TableCell>
                    <TableCell className="text-sm">{d.deviceType ?? '—'}</TableCell>
                    <TableCell className="text-sm">{d.model ?? '—'}</TableCell>
                    <TableCell className="text-sm">{d.brand ?? '—'}</TableCell>
                    <TableCell><StatusBadge status={d.status} /></TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {d.isVirtual && d.status !== 'DISABLED' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            disabled={disablingId === d.id || enablingId === d.id || deletingId === d.id}
                            onClick={() => openEdit(d)}
                            title="Editar"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {d.status === 'DISABLED' ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-green-600"
                            disabled={enablingId === d.id || deletingId === d.id}
                            onClick={() => handleEnable(d)}
                            title="Habilitar"
                          >
                            <CircleCheck className={cn('w-3.5 h-3.5', enablingId === d.id && 'animate-pulse')} />
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-amber-600"
                            disabled={disablingId === d.id || enablingId === d.id || deletingId === d.id}
                            onClick={() => handleDisable(d.id)}
                            title="Deshabilitar"
                          >
                            <Ban className={cn('w-3.5 h-3.5', disablingId === d.id && 'animate-pulse')} />
                          </Button>
                        )}
                        {d.isVirtual && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            disabled={disablingId === d.id || enablingId === d.id || deletingId === d.id}
                            onClick={() => handleDelete(d.id)}
                            title="Eliminar"
                          >
                            <Trash2 className={cn('w-3.5 h-3.5', deletingId === d.id && 'animate-pulse')} />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {selectedUser && (
        <VirtualDeviceDialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          onSaved={handleSaved}
          userId={selectedUser.id}
          editing={editingDevice}
        />
      )}
    </div>
  )
}
