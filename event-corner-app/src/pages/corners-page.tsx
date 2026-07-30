import { useEffect, useState } from 'react'
import { Plus, MapPin, AlertCircle, ChevronDown, ChevronUp, Pencil, Trash2, SquarePen, Search, CheckCircle2, Clock, Globe, Building2, Wrench, RefreshCw } from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cornersApi, techniciansApi, snowGroupsApi, snowLocationsApi, Corner, CornerSchedule, TechnicianProfile, ServiceNowGroup, SnLocation } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useAuth } from '@/context/auth'

const DAY_NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

interface CornerForm {
  name: string
  description: string
  country: string
  city: string
  timezone: string
  latitude: string
  longitude: string
  onlyTechnicians: boolean
  servicenowLocation: string
  snowAssignmentGroup: string
}

const EMPTY_CORNER: CornerForm = {
  name: '',
  description: '',
  country: '',
  city: '',
  timezone: 'America/Argentina/Buenos_Aires',
  latitude: '',
  longitude: '',
  onlyTechnicians: false,
  servicenowLocation: '',
  snowAssignmentGroup: '',
}

const TIMEZONE_OPTIONS = [
  { label: 'Argentina (Buenos Aires) — UTC-3', value: 'America/Argentina/Buenos_Aires', short: 'UTC-3' },
  { label: 'Argentina (Córdoba) — UTC-3', value: 'America/Argentina/Cordoba', short: 'UTC-3' },
  { label: 'Uruguay — UTC-3', value: 'America/Montevideo', short: 'UTC-3' },
  { label: 'Brasil (São Paulo) — UTC-3', value: 'America/Sao_Paulo', short: 'UTC-3' },
  { label: 'Chile (Santiago) — UTC-4/-3', value: 'America/Santiago', short: 'UTC-4/-3' },
  { label: 'Paraguay (Asunción) — UTC-4/-3', value: 'America/Asuncion', short: 'UTC-4/-3' },
  { label: 'Bolivia — UTC-4', value: 'America/La_Paz', short: 'UTC-4' },
  { label: 'Venezuela — UTC-4', value: 'America/Caracas', short: 'UTC-4' },
  { label: 'Colombia — UTC-5', value: 'America/Bogota', short: 'UTC-5' },
  { label: 'Ecuador — UTC-5', value: 'America/Guayaquil', short: 'UTC-5' },
  { label: 'Perú — UTC-5', value: 'America/Lima', short: 'UTC-5' },
  { label: 'México (Ciudad de México) — UTC-6/-5', value: 'America/Mexico_City', short: 'UTC-6/-5' },
  { label: 'España (Madrid) — UTC+1/+2', value: 'Europe/Madrid', short: 'UTC+1/+2' },
  { label: 'UTC', value: 'UTC', short: 'UTC' },
]

interface ScheduleForm {
  name: string
  startTime: string
  endTime: string
  validFrom: string
  validUntil: string
  slotDurationMinutes: number
}

const localDateStr = (d: Date = new Date()) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const todayIso = () => localDateStr()
const oneWeekIso = () => {
  const d = new Date()
  d.setDate(d.getDate() + 7)
  return localDateStr(d)
}

const SLOT_DURATION_OPTIONS = [
  { label: '10 min', value: 10 },
  { label: '15 min', value: 15 },
  { label: '20 min', value: 20 },
  { label: '30 min', value: 30 },
  { label: '45 min', value: 45 },
  { label: '1 hora', value: 60 },
  { label: '1h 30min', value: 90 },
  { label: '2 horas', value: 120 },
]

const EMPTY_SCHEDULE: ScheduleForm = {
  name: '',
  startTime: '09:00',
  endTime: '18:00',
  validFrom: todayIso(),
  validUntil: oneWeekIso(),
  slotDurationMinutes: 15,
}

function tzShort(tz: string) {
  return TIMEZONE_OPTIONS.find((o) => o.value === tz)?.short ?? tz
}

function locationLabel(city?: string | null, country?: string) {
  const parts = [city, country].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '—'
}

export function CornersPage() {
  const { can } = useAuth()
  const canCreateCorner = can('corner:create')
  const canUpdateCorner = can('corner:update')
  const canDeleteCorner = can('corner:delete')

  const [corners, setCorners] = useState<Corner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [schedules, setSchedules] = useState<Record<string, CornerSchedule[]>>({})
  const [cornerTechs, setCornerTechs] = useState<Record<string, TechnicianProfile[]>>({})
  const [allTechs, setAllTechs] = useState<TechnicianProfile[]>([])

  const [showDialog, setShowDialog] = useState(false)
  const [editingCorner, setEditingCorner] = useState<Corner | null>(null)
  const [form, setForm] = useState<CornerForm>(EMPTY_CORNER)

  const [showScheduleDialog, setShowScheduleDialog] = useState<string | null>(null)
  const [editingSchedule, setEditingSchedule] = useState<CornerSchedule | null>(null)
  const [scheduleForm, setScheduleForm] = useState<ScheduleForm>(EMPTY_SCHEDULE)

  const [showTechDialog, setShowTechDialog] = useState<string | null>(null)
  const [selectedTechId, setSelectedTechId] = useState('')

  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [snowGroups, setSnowGroups] = useState<ServiceNowGroup[]>([])
  const [snLocations, setSnLocations] = useState<SnLocation[]>([])
  const [snLocationSearch, setSnLocationSearch] = useState('')
  const [snGroupSearch, setSnGroupSearch] = useState('')
  const [selectedSnLocationId, setSelectedSnLocationId] = useState('')
  const [selectedSnGroupId, setSelectedSnGroupId] = useState('')
  const [syncingGroups, setSyncingGroups] = useState(false)
  const [syncGroupsError, setSyncGroupsError] = useState('')

  // ── Load ──────────────────────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setCorners(await cornersApi.list())
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al cargar corners')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Catálogo local (rápido) — se sincroniza manualmente con el botón "Sincronizar"
    snowGroupsApi.list().then(setSnowGroups).catch(() => setSnowGroups([]))
    snowLocationsApi.listSnCatalog().then(setSnLocations).catch(() => setSnLocations([]))
  }, [])

  const handleSyncGroups = async () => {
    setSyncingGroups(true)
    setSyncGroupsError('')
    try {
      await snowGroupsApi.sync()
      setSnowGroups(await snowGroupsApi.list())
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setSyncGroupsError(msg || 'Error al sincronizar con ServiceNow')
    } finally {
      setSyncingGroups(false)
    }
  }

  const loadSchedules = async (cornerId: string) => {
    if (schedules[cornerId]) return
    try {
      const data = await cornersApi.getSchedules(cornerId)
      setSchedules((prev) => ({ ...prev, [cornerId]: data }))
    } catch {
      setSchedules((prev) => ({ ...prev, [cornerId]: [] }))
    }
  }

  const loadCornerTechs = async (cornerId: string) => {
    try {
      // list(cornerId) usa findByCorner, que excluye deshabilitados (ese filtro
      // lo necesita el cálculo de disponibilidad). Acá hay que verlos igual:
      // esta lista tiene el botón Habilitar/Desactivar por técnico.
      const data = await techniciansApi.list()
      setCornerTechs((prev) => ({ ...prev, [cornerId]: data.filter((t) => t.cornerId === cornerId) }))
    } catch {
      setCornerTechs((prev) => ({ ...prev, [cornerId]: [] }))
    }
  }

  const toggleExpand = (cornerId: string) => {
    if (expandedId === cornerId) {
      setExpandedId(null)
    } else {
      setExpandedId(cornerId)
      loadSchedules(cornerId)
      loadCornerTechs(cornerId)
    }
  }

  // ── Assign technician ─────────────────────────────────────────────────────────

  const openAssignTechnician = async (cornerId: string) => {
    setSelectedTechId('')
    setFormError('')
    setShowTechDialog(cornerId)
    if (allTechs.length === 0) {
      try {
        setAllTechs(await techniciansApi.list())
      } catch { /* silencioso */ }
    }
  }

  const handleAssignTechnician = async () => {
    if (!showTechDialog || !selectedTechId) return
    setSaving(true)
    setFormError('')
    try {
      await techniciansApi.assignCorner(selectedTechId, showTechDialog)
      setShowTechDialog(null)
      setCornerTechs((prev) => { const next = { ...prev }; delete next[showTechDialog]; return next })
      setAllTechs([])
      loadCornerTechs(showTechDialog)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setFormError(msg || 'Error al asignar técnico')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleTechnician = async (cornerId: string, techId: string, disabled: boolean) => {
    try {
      if (disabled) await techniciansApi.enable(techId)
      else await techniciansApi.disable(techId)
      setCornerTechs((prev) => { const next = { ...prev }; delete next[cornerId]; return next })
      loadCornerTechs(cornerId)
    } catch { /* silencioso */ }
  }

  // ── Create / Edit ─────────────────────────────────────────────────────────────

  const openCreate = () => {
    if (!canCreateCorner) return
    setEditingCorner(null)
    setForm(EMPTY_CORNER)
    setFormError('')
    setSnLocationSearch('')
    setSnGroupSearch('')
    setSelectedSnLocationId('')
    setSelectedSnGroupId('')
    setShowDialog(true)
  }

  const openEdit = (corner: Corner) => {
    if (!canUpdateCorner) return
    setEditingCorner(corner)
    const snLoc = corner.servicenowLocation ?? ''
    const snGroup = corner.snowAssignmentGroup ?? ''
    setForm({
      name: corner.name,
      description: corner.description ?? '',
      country: corner.country ?? '',
      city: corner.city ?? '',
      timezone: corner.timezone ?? 'America/Argentina/Buenos_Aires',
      latitude: corner.latitude != null ? String(corner.latitude) : '',
      longitude: corner.longitude != null ? String(corner.longitude) : '',
      onlyTechnicians: corner.onlyTechnicians ?? false,
      servicenowLocation: snLoc,
      snowAssignmentGroup: snGroup,
    })
    setSelectedSnLocationId(snLocations.find((l) => l.sys_id === snLoc)?.sys_id ?? '')
    setSelectedSnGroupId(snGroup)
    setFormError('')
    setSnLocationSearch('')
    setSnGroupSearch('')
    setShowDialog(true)
  }

  const f = (field: keyof CornerForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [field]: e.target.value }))

  const handleSave = async () => {
    if (!form.name.trim()) {
      setFormError('El nombre es obligatorio')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        country: form.country.trim() || undefined,
        city: form.city.trim() || undefined,
        timezone: form.timezone.trim() || undefined,
        latitude: form.latitude !== '' ? Number(form.latitude) : undefined,
        longitude: form.longitude !== '' ? Number(form.longitude) : undefined,
        onlyTechnicians: form.onlyTechnicians,
        servicenowLocation: form.servicenowLocation.trim() || undefined,
        snowAssignmentGroup: form.snowAssignmentGroup.trim() || undefined,
      }

      if (editingCorner) {
        await cornersApi.update(editingCorner.id, payload)
      } else {
        await cornersApi.create(payload)
      }

      setShowDialog(false)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setFormError(msg || 'Error al guardar el corner')
    } finally {
      setSaving(false)
    }
  }

  // ── Schedule ──────────────────────────────────────────────────────────────────

  const openAddSchedule = (cornerId: string) => {
    setEditingSchedule(null)
    setScheduleForm({ ...EMPTY_SCHEDULE, validFrom: todayIso(), validUntil: oneWeekIso() })
    setFormError('')
    setShowScheduleDialog(cornerId)
  }

  const openEditSchedule = (cornerId: string, schedule: CornerSchedule) => {
    setEditingSchedule(schedule)
    setScheduleForm({
      name: schedule.name,
      startTime: schedule.startTime?.substring(0, 5) ?? '09:00',
      endTime: schedule.endTime?.substring(0, 5) ?? '18:00',
      validFrom: schedule.validFrom ? localDateStr(new Date(schedule.validFrom)) : todayIso(),
      validUntil: schedule.validUntil ? localDateStr(new Date(schedule.validUntil)) : oneWeekIso(),
      slotDurationMinutes: schedule.slotDurationMinutes ?? 15,
    })
    setFormError('')
    setShowScheduleDialog(cornerId)
  }

  const sf = (field: keyof ScheduleForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setScheduleForm((p) => ({ ...p, [field]: e.target.value }))

  const handleSaveSchedule = async () => {
    if (!showScheduleDialog) return
    if (!scheduleForm.name.trim()) {
      setFormError('El nombre del horario es obligatorio')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        name: scheduleForm.name.trim(),
        startTime: scheduleForm.startTime,
        endTime: scheduleForm.endTime,
        validFrom: scheduleForm.validFrom,
        validUntil: scheduleForm.validUntil,
        slotDurationMinutes: Number(scheduleForm.slotDurationMinutes),
      }
      if (editingSchedule) {
        await cornersApi.updateSchedule(showScheduleDialog, editingSchedule.id, payload)
      } else {
        await cornersApi.addSchedule(showScheduleDialog, payload)
      }
      setSchedules((prev) => {
        const next = { ...prev }
        delete next[showScheduleDialog]
        return next
      })
      setShowScheduleDialog(null)
      setEditingSchedule(null)
      if (expandedId === showScheduleDialog) {
        loadSchedules(showScheduleDialog)
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setFormError(msg || (editingSchedule ? 'Error al actualizar horario' : 'Error al agregar horario'))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteSchedule = async (cornerId: string, scheduleId: string, scheduleName: string) => {
    if (!confirm(`¿Eliminar el horario "${scheduleName}"? Esta acción no se puede deshacer.`)) return
    try {
      await cornersApi.deleteSchedule(cornerId, scheduleId)
      setSchedules((prev) => ({
        ...prev,
        [cornerId]: (prev[cornerId] ?? []).filter((s) => s.id !== scheduleId),
      }))
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al eliminar el horario')
    }
  }

  // ── Deactivate ────────────────────────────────────────────────────────────────

  const handleDeactivate = async (cornerId: string) => {
    if (!canDeleteCorner) return
    if (!confirm('¿Desactivar este corner?')) return
    try {
      await cornersApi.deactivate(cornerId)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al desactivar corner')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <Header title="Corners" icon={MapPin} onRefresh={load} loading={loading}>
        {canCreateCorner && (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Nuevo Corner
          </Button>
        )}
      </Header>

      <div className="flex-1 p-6 space-y-4 overflow-auto">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : corners.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <MapPin className="h-10 w-10 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No hay corners configurados</p>
            {canCreateCorner && (
              <Button className="mt-4" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                Crear primer corner
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="w-[280px]">Nombre</TableHead>
                  <TableHead className="w-[180px]">
                    <span className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5" />
                      Ciudad · País
                    </span>
                  </TableHead>
                  <TableHead className="w-[200px]">
                    <span className="flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5" />
                      Zona horaria
                    </span>
                  </TableHead>
                  <TableHead className="w-[90px]">Estado</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {corners.map((corner) => (
                  <>
                    <TableRow
                      key={corner.id}
                      className={cn(
                        'cursor-pointer transition-colors',
                        expandedId === corner.id && 'bg-muted/20 border-b-0',
                      )}
                      onClick={() => toggleExpand(corner.id)}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {expandedId === corner.id ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate">{corner.name}</p>
                            {corner.description && (
                              <p className="text-xs text-muted-foreground truncate max-w-[220px]">{corner.description}</p>
                            )}
                          </div>
                        </div>
                      </TableCell>

                      <TableCell>
                        <span className="text-sm">
                          {locationLabel(corner.city, corner.country)}
                        </span>
                      </TableCell>

                      <TableCell>
                        {corner.timezone ? (
                          <div>
                            <p className="text-sm">{corner.timezone.split('/').pop()?.replace('_', ' ')}</p>
                            <p className="text-xs text-muted-foreground">{tzShort(corner.timezone)}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">—</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <Badge
                          variant={corner.isActive ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {corner.isActive ? 'Activo' : 'Inactivo'}
                        </Badge>
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          {canUpdateCorner && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2"
                              title="Editar corner"
                              onClick={() => openEdit(corner)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span className="ml-1 text-xs">Editar</span>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2"
                            title="Agregar horario"
                            onClick={() => openAddSchedule(corner.id)}
                          >
                            <Clock className="h-3.5 w-3.5" />
                            <span className="ml-1 text-xs">Horario</span>
                          </Button>
                          {corner.isActive && canDeleteCorner && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDeactivate(corner.id)}
                            >
                              <span className="text-xs">Desactivar</span>
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>

                    {expandedId === corner.id && (
                      <TableRow key={`${corner.id}-expanded`} className="hover:bg-transparent">
                        <TableCell colSpan={5} className="p-0 border-t border-dashed">
                          <div className="bg-muted/10 divide-y">

                            {/* ── Bloque 1: Configuración ──────────────────── */}
                            <div className="px-6 py-4">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Configuración</p>
                              <dl className="flex flex-wrap gap-x-8 gap-y-2 text-sm">
                                <div className="flex gap-2 items-baseline">
                                  <dt className="text-muted-foreground text-xs shrink-0">ID</dt>
                                  <dd><code className="font-mono text-xs bg-muted px-1 py-0.5 rounded">{corner.id}</code></dd>
                                </div>

                                {corner.servicenowLocation && (
                                  <div className="flex gap-2 items-baseline">
                                    <dt className="text-muted-foreground text-xs shrink-0">SN Location</dt>
                                    <dd className="text-sm">
                                      {(() => {
                                        const loc = snLocations.find((l) => l.sys_id === String(corner.servicenowLocation))
                                        return loc
                                          ? <span>{loc.name}</span>
                                          : <code className="font-mono text-xs">{corner.servicenowLocation}</code>
                                      })()}
                                    </dd>
                                  </div>
                                )}

                                {corner.snowAssignmentGroup && (
                                  <div className="flex gap-2 items-baseline">
                                    <dt className="text-muted-foreground text-xs shrink-0">SN Group</dt>
                                    <dd className="text-sm">
                                      {(() => {
                                        const grp = snowGroups.find((g) => g.groupId === corner.snowAssignmentGroup)
                                        return grp
                                          ? <span>{grp.groupName}</span>
                                          : <code className="font-mono text-xs">{corner.snowAssignmentGroup}</code>
                                      })()}
                                    </dd>
                                  </div>
                                )}

                                <div className="flex gap-2 items-baseline">
                                  <dt className="text-muted-foreground text-xs shrink-0">Solo técnicos</dt>
                                  <dd>
                                    <Badge variant={corner.onlyTechnicians ? 'outline' : 'secondary'} className="text-xs">
                                      {corner.onlyTechnicians ? 'Sí' : 'No'}
                                    </Badge>
                                  </dd>
                                </div>

                                {corner.latitude != null && corner.longitude != null && (
                                  <div className="flex gap-2 items-baseline">
                                    <dt className="text-muted-foreground text-xs shrink-0">Coordenadas</dt>
                                    <dd className="text-xs text-muted-foreground font-mono">{corner.latitude}, {corner.longitude}</dd>
                                  </div>
                                )}
                              </dl>
                            </div>

                            {/* ── Bloque 2: Horarios ───────────────────────── */}
                            <div className="px-6 py-4">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" /> Horarios
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={(e) => { e.stopPropagation(); openAddSchedule(corner.id) }}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Agregar
                                </Button>
                              </div>

                              {!schedules[corner.id] ? (
                                <p className="text-xs text-muted-foreground">Cargando...</p>
                              ) : schedules[corner.id].length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Sin horarios configurados</p>
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  {schedules[corner.id].map((s) => (
                                    <div
                                      key={s.id}
                                      className="flex items-center justify-between text-xs bg-background border rounded-md px-3 py-2 hover:bg-muted/30 transition-colors"
                                    >
                                      <div className="flex items-center gap-3 min-w-0">
                                        <span className="font-medium shrink-0">{s.name}</span>
                                        <span className="text-muted-foreground shrink-0">{s.startTime} — {s.endTime}</span>
                                        <span className="text-muted-foreground hidden sm:inline truncate">
                                          {s.validFrom ? new Date(s.validFrom).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
                                          {' → '}
                                          {s.validUntil ? new Date(s.validUntil).toLocaleDateString('es', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
                                        </span>
                                        {s.slotDurationMinutes && (
                                          <Badge variant="outline" className="text-xs py-0 h-4 shrink-0">
                                            {s.slotDurationMinutes} min
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 ml-3 shrink-0">
                                        <button
                                          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                                          title="Editar horario"
                                          onClick={(e) => { e.stopPropagation(); openEditSchedule(corner.id, s) }}
                                        >
                                          <SquarePen className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                          title="Eliminar horario"
                                          onClick={(e) => { e.stopPropagation(); handleDeleteSchedule(corner.id, s.id, s.name) }}
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* ── Bloque 3: Técnicos ───────────────────────── */}
                            <div className="px-6 py-4">
                              <div className="flex items-center justify-between mb-3">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                                  <Wrench className="h-3.5 w-3.5" /> Técnicos
                                </p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs"
                                  onClick={(e) => { e.stopPropagation(); openAssignTechnician(corner.id) }}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Añadir
                                </Button>
                              </div>

                              {!cornerTechs[corner.id] ? (
                                <p className="text-xs text-muted-foreground">Cargando...</p>
                              ) : cornerTechs[corner.id].length === 0 ? (
                                <p className="text-xs text-muted-foreground italic">Sin técnicos asignados</p>
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {cornerTechs[corner.id].map((t) => (
                                    <div
                                      key={t.id}
                                      className={cn(
                                        'flex items-center gap-2 text-xs border rounded-md px-2.5 py-1.5 bg-background',
                                        t.disabled && 'opacity-50',
                                      )}
                                    >
                                      <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center shrink-0">
                                        <span className="text-xs font-medium">{(t.fullName ?? t.name).charAt(0).toUpperCase()}</span>
                                      </div>
                                      <div className="min-w-0">
                                        <p className={cn('font-medium leading-none', t.disabled && 'line-through text-muted-foreground')}>
                                          {t.fullName ?? t.name}
                                        </p>
                                        <p className="text-muted-foreground text-xs truncate max-w-[140px]">{t.email}</p>
                                      </div>
                                      <button
                                        className={cn(
                                          'text-xs underline ml-1 shrink-0',
                                          t.disabled ? 'text-green-600 hover:text-green-700' : 'text-destructive hover:text-destructive/80',
                                        )}
                                        onClick={(e) => { e.stopPropagation(); handleToggleTechnician(corner.id, t.id, t.disabled) }}
                                      >
                                        {t.disabled ? 'Habilitar' : 'Desactivar'}
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* ── Create / Edit corner dialog ──────────────────────────────────────── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingCorner ? 'Editar Corner' : 'Nuevo Corner'}</DialogTitle>
            <DialogDescription>
              {editingCorner ? `Editando: ${editingCorner.name}` : 'Configura un nuevo punto de servicio'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">

            {/* Bloque: Información básica */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Información básica</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2 col-span-2">
                  <Label>Nombre <span className="text-destructive">*</span></Label>
                  <Input value={form.name} onChange={f('name')} placeholder="Corner Madrid Centro" />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Descripción</Label>
                  <Input value={form.description} onChange={f('description')} placeholder="Descripción del corner" />
                </div>
              </div>
            </div>

            <div className="border-t" />

            {/* Bloque: Ubicación */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
                <Globe className="h-3.5 w-3.5" /> Ubicación
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ciudad</Label>
                  <Input value={form.city} onChange={f('city')} placeholder="Madrid" />
                </div>
                <div className="space-y-2">
                  <Label>País <span className="text-xs text-muted-foreground">(código ISO)</span></Label>
                  <Input value={form.country} onChange={f('country')} placeholder="ES" maxLength={2} />
                </div>
                <div className="space-y-2 col-span-2">
                  <Label>Zona horaria <span className="text-destructive">*</span></Label>
                  <select
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    value={form.timezone}
                    onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Las horas de los horarios se interpretan en esta zona horaria.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Latitud</Label>
                  <Input type="number" value={form.latitude} onChange={f('latitude')} placeholder="40.4168" />
                </div>
                <div className="space-y-2">
                  <Label>Longitud</Label>
                  <Input type="number" value={form.longitude} onChange={f('longitude')} placeholder="-3.7038" />
                </div>
              </div>
            </div>

            <div className="border-t" />

            {/* Bloque: ServiceNow */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Integración ServiceNow
              </p>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Location</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar location..."
                      value={snLocationSearch}
                      onChange={(e) => setSnLocationSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto border rounded-md divide-y">
                    {snLocations.filter((l) => {
                      const q = snLocationSearch.toLowerCase()
                      return !q || l.name.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q) || l.country?.toLowerCase().includes(q)
                    }).length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Sin resultados</p>
                    ) : snLocations
                        .filter((l) => {
                          const q = snLocationSearch.toLowerCase()
                          return !q || l.name.toLowerCase().includes(q) || l.city?.toLowerCase().includes(q) || l.country?.toLowerCase().includes(q)
                        })
                        .map((l) => (
                          <div
                            key={l.sys_id}
                            onClick={() => {
                              setSelectedSnLocationId(l.sys_id)
                              setForm((f) => ({ ...f, servicenowLocation: l.sys_id }))
                            }}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors text-sm',
                              selectedSnLocationId === l.sys_id ? 'bg-primary/10' : 'hover:bg-muted/50',
                            )}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate">{l.name}</p>
                              {(l.city || l.country) && (
                                <p className="text-xs text-muted-foreground truncate">{[l.city, l.country].filter(Boolean).join(' · ')}</p>
                              )}
                            </div>
                            {selectedSnLocationId === l.sys_id && (
                              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                            )}
                          </div>
                        ))
                    }
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Assignment Group</Label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1.5 text-xs text-muted-foreground"
                      disabled={syncingGroups}
                      onClick={handleSyncGroups}
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', syncingGroups && 'animate-spin')} />
                      Sincronizar
                    </Button>
                  </div>
                  {syncGroupsError && (
                    <p className="text-xs text-destructive">{syncGroupsError}</p>
                  )}
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      className="pl-9"
                      placeholder="Buscar grupo de asignación..."
                      value={snGroupSearch}
                      onChange={(e) => setSnGroupSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-36 overflow-y-auto border rounded-md divide-y">
                    {snowGroups.filter((g) => {
                      if (!g.isActive) return false
                      const q = snGroupSearch.toLowerCase()
                      return !q || g.groupName.toLowerCase().includes(q)
                    }).length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">Sin resultados</p>
                    ) : snowGroups
                        .filter((g) => {
                          if (!g.isActive) return false
                          const q = snGroupSearch.toLowerCase()
                          return !q || g.groupName.toLowerCase().includes(q)
                        })
                        .map((g) => (
                          <div
                            key={g.groupId}
                            onClick={() => {
                              setSelectedSnGroupId(g.groupId)
                              setForm((f) => ({ ...f, snowAssignmentGroup: g.groupId }))
                            }}
                            className={cn(
                              'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors text-sm',
                              selectedSnGroupId === g.groupId ? 'bg-primary/10' : 'hover:bg-muted/50',
                            )}
                          >
                            <p className="font-medium truncate flex-1">{g.groupName}</p>
                            {selectedSnGroupId === g.groupId && (
                              <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                            )}
                          </div>
                        ))
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Fallback cuando no hay configuración específica por empresa/tipo de incidencia.
                  </p>
                </div>
              </div>
            </div>

            <div className="border-t" />

            {/* Bloque: Opciones */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="onlyTechnicians"
                checked={form.onlyTechnicians}
                onChange={(e) => setForm((p) => ({ ...p, onlyTechnicians: e.target.checked }))}
                className="h-4 w-4"
              />
              <Label htmlFor="onlyTechnicians" className="cursor-pointer">
                Solo técnicos — no visible para clientes en el portal
              </Label>
            </div>
          </div>

          {formError && (
            <Alert variant="destructive" className="mt-2">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando...' : editingCorner ? 'Guardar cambios' : 'Crear Corner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Assign technician dialog ─────────────────────────────────────────── */}
      <Dialog open={!!showTechDialog} onOpenChange={(open) => !open && setShowTechDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Añadir técnico al corner</DialogTitle>
            <DialogDescription>
              Selecciona un técnico ya registrado. Para crear nuevos, ve a la sección Técnicos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Técnico <span className="text-destructive">*</span></Label>
            <select
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={selectedTechId}
              onChange={(e) => setSelectedTechId(e.target.value)}
            >
              <option value="">— Selecciona un técnico —</option>
              {allTechs
                .filter((t) => !t.disabled && t.cornerId !== showTechDialog)
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.fullName ?? t.name} — {t.email}
                  </option>
                ))}
            </select>
            {allTechs.filter((t) => !t.disabled && t.cornerId !== showTechDialog).length === 0 && (
              <p className="text-xs text-muted-foreground">No hay técnicos disponibles para asignar.</p>
            )}
          </div>

          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTechDialog(null)}>Cancelar</Button>
            <Button onClick={handleAssignTechnician} disabled={saving || !selectedTechId}>
              {saving ? 'Asignando...' : 'Asignar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Add / Edit schedule dialog ────────────────────────────────────────── */}
      <Dialog open={!!showScheduleDialog} onOpenChange={(open) => { if (!open) { setShowScheduleDialog(null); setEditingSchedule(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingSchedule ? 'Editar horario' : 'Agregar horario'}</DialogTitle>
            <DialogDescription>
              {editingSchedule
                ? 'Los slots no usados se borrarán y se regenerarán con los nuevos parámetros.'
                : 'Define un rango de fechas y el bloque horario diario. Se generarán slots para cada día del rango.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre del horario <span className="text-destructive">*</span></Label>
              <Input
                value={scheduleForm.name}
                onChange={sf('name')}
                placeholder="Ej: Turno mañana Lunes"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Hora inicio</Label>
                <Input type="time" value={scheduleForm.startTime} onChange={sf('startTime')} />
              </div>
              <div className="space-y-2">
                <Label>Hora fin</Label>
                <Input type="time" value={scheduleForm.endTime} onChange={sf('endTime')} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Generar slots desde</Label>
                <Input type="date" value={scheduleForm.validFrom} onChange={sf('validFrom')} />
              </div>
              <div className="space-y-2">
                <Label>Generar slots hasta</Label>
                <Input type="date" value={scheduleForm.validUntil} onChange={sf('validUntil')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Duración de slot <span className="text-destructive">*</span></Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                value={scheduleForm.slotDurationMinutes}
                onChange={(e) => setScheduleForm((p) => ({ ...p, slotDurationMinutes: Number(e.target.value) }))}
              >
                {SLOT_DURATION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <Card className="bg-muted/40 shadow-none">
              <CardContent className="p-3 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">¿Cómo funcionan los slots?</p>
                <p>Se crea <strong>un slot por cada bloque de tiempo</strong> en <strong>cada día</strong> del rango.</p>
                <p>Ej: del 13 al 18, de 09:00 a 18:00, slots de 15 min → 36 slots/día × 6 días = 216 slots.</p>
              </CardContent>
            </Card>
          </div>

          {formError && (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowScheduleDialog(null); setEditingSchedule(null) }}>Cancelar</Button>
            <Button onClick={handleSaveSchedule} disabled={saving}>
              {saving ? 'Guardando...' : editingSchedule ? 'Guardar cambios' : 'Agregar horario'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
