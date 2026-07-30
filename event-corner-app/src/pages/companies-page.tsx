import { useEffect, useRef, useState } from 'react'
import {
  Plus, Building2, AlertCircle, Pencil, Trash2, Search, X, ShieldCheck,
  Upload, Server, CheckCircle2, XCircle, RefreshCw,
} from 'lucide-react'
import { Header } from '@/components/header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { companiesApi, Company, IssueTypeTree, SnProfile } from '@/lib/api'

// ─── Company form ─────────────────────────────────────────────────────────────

const EMPTY_COMPANY_FORM = {
  name: '',
  treeId: '',
  profileId: null as string | null,
  isActive: true,
}

type CompanyFormState = typeof EMPTY_COMPANY_FORM

// ─── SN Profile form ──────────────────────────────────────────────────────────

const EMPTY_SN_FORM = {
  name: '',
  snowCompanySysId: '',
  snowCompanyName: '',
  isActive: true,
}

type SnFormState = typeof EMPTY_SN_FORM

// ─── CSV parsing ──────────────────────────────────────────────────────────────

function parseCsvLines(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(',').map((c) => c.trim().replace(/^"|"$/g, '')))
}

function parseSnProfileCsv(text: string): Array<{ name: string; snowCompanySysId: string; snowCompanyName: string }> {
  const result: Array<{ name: string; snowCompanySysId: string; snowCompanyName: string }> = []
  for (const cols of parseCsvLines(text)) {
    if (cols.length < 3) continue
    const [name, snowCompanySysId, snowCompanyName] = cols
    if (!name || !snowCompanySysId || !snowCompanyName) continue
    if (name.toLowerCase() === 'name' || name.toLowerCase() === 'nombre') continue
    result.push({ name, snowCompanySysId, snowCompanyName })
  }
  return result
}

type CompanyCsvRow = {
  name: string
  treeName: string
  profileName: string
  treeId: string | null
  profileId: string | null
  treeError: boolean
}

function parseCompanyCsv(
  text: string,
  trees: IssueTypeTree[],
  snProfiles: SnProfile[],
): CompanyCsvRow[] {
  const result: CompanyCsvRow[] = []
  for (const cols of parseCsvLines(text)) {
    if (cols.length < 2) continue
    const [name, treeName, profileName = ''] = cols
    if (!name || !treeName) continue
    if (name.toLowerCase() === 'nombre' || name.toLowerCase() === 'name') continue
    const tree = trees.find((t) => t.name.toLowerCase() === treeName.toLowerCase())
    const profile = profileName
      ? snProfiles.find((p) => p.name.toLowerCase() === profileName.toLowerCase())
      : undefined
    result.push({
      name,
      treeName,
      profileName,
      treeId: tree?.id ?? null,
      profileId: profile?.id ?? null,
      treeError: !tree,
    })
  }
  return result
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function CompaniesPage() {
  // ── Companies state ────────────────────────────────────────────────────────
  const [companies, setCompanies] = useState<Company[]>([])
  const [trees, setTrees] = useState<IssueTypeTree[]>([])
  const [snProfiles, setSnProfiles] = useState<SnProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [showCompanyDialog, setShowCompanyDialog] = useState(false)
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null)
  const [companyForm, setCompanyForm] = useState<CompanyFormState>(EMPTY_COMPANY_FORM)
  const [savingCompany, setSavingCompany] = useState(false)
  const [companyFormError, setCompanyFormError] = useState('')
  const [deleteCompanyId, setDeleteCompanyId] = useState<string | null>(null)

  // ── SN Profiles state ──────────────────────────────────────────────────────
  const [snSearch, setSnSearch] = useState('')
  const [showSnDialog, setShowSnDialog] = useState(false)
  const [editingSnId, setEditingSnId] = useState<string | null>(null)
  const [snForm, setSnForm] = useState<SnFormState>(EMPTY_SN_FORM)
  const [savingSn, setSavingSn] = useState(false)
  const [snFormError, setSnFormError] = useState('')
  const [deleteSnId, setDeleteSnId] = useState<string | null>(null)

  // ── Sync desde SN ─────────────────────────────────────────────────────────
  const [syncingFromSn, setSyncingFromSn] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; skipped: number; errors: number } | null>(null)

  const handleSyncFromSn = async () => {
    setSyncingFromSn(true)
    setSyncResult(null)
    try {
      const result = await companiesApi.syncFromSn()
      setSyncResult(result)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al sincronizar desde ServiceNow')
    } finally {
      setSyncingFromSn(false)
    }
  }

  // ── Company CSV import state ───────────────────────────────────────────────
  const [showCompanyCsvDialog, setShowCompanyCsvDialog] = useState(false)
  const [companyCsvRows, setCompanyCsvRows] = useState<CompanyCsvRow[]>([])
  const [companyCsvError, setCompanyCsvError] = useState('')
  const [importingCompanyCsv, setImportingCompanyCsv] = useState(false)
  const [companyImportResult, setCompanyImportResult] = useState<{ created: number; errors: Array<{ row: number; message: string }> } | null>(null)
  const companyFileInputRef = useRef<HTMLInputElement>(null)

  // ── SN Profile CSV import state ────────────────────────────────────────────
  const [showCsvDialog, setShowCsvDialog] = useState(false)
  const [csvRows, setCsvRows] = useState<Array<{ name: string; snowCompanySysId: string; snowCompanyName: string }>>([])
  const [csvError, setCsvError] = useState('')
  const [importingCsv, setImportingCsv] = useState(false)
  const [importResult, setImportResult] = useState<{ created: number; errors: Array<{ row: number; message: string }> } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Load ───────────────────────────────────────────────────────────────────
  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [data, treesData, profilesData] = await Promise.all([
        companiesApi.list(),
        companiesApi.listTrees(),
        companiesApi.listSnProfiles(),
      ])
      setCompanies(data)
      setTrees(treesData)
      setSnProfiles(profilesData)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al cargar compañías')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Company helpers ────────────────────────────────────────────────────────
  const openCreateCompany = () => {
    setEditingCompanyId(null)
    setCompanyForm(EMPTY_COMPANY_FORM)
    setCompanyFormError('')
    setShowCompanyDialog(true)
  }

  const openEditCompany = (c: Company) => {
    setEditingCompanyId(c.id)
    setCompanyForm({
      name: c.name,
      treeId: c.treeId ?? '',
      profileId: c.profileId ?? null,
      isActive: c.isActive ?? true,
    })
    setCompanyFormError('')
    setShowCompanyDialog(true)
  }

  const setCompanyField = <K extends keyof CompanyFormState>(key: K, value: CompanyFormState[K]) =>
    setCompanyForm((p) => ({ ...p, [key]: value }))

  const handleSaveCompany = async () => {
    if (!companyForm.name.trim()) { setCompanyFormError('El nombre es obligatorio'); return }
    if (!companyForm.treeId) { setCompanyFormError('El árbol de tipos de cita es obligatorio'); return }

    setSavingCompany(true)
    setCompanyFormError('')
    try {
      if (editingCompanyId) {
        await companiesApi.update(editingCompanyId, {
          name: companyForm.name,
          treeId: companyForm.treeId,
          profileId: companyForm.profileId,
          isActive: companyForm.isActive,
        })
      } else {
        await companiesApi.create({
          name: companyForm.name,
          treeId: companyForm.treeId,
          profileId: companyForm.profileId,
        })
      }
      setShowCompanyDialog(false)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setCompanyFormError(msg || 'Error al guardar')
    } finally {
      setSavingCompany(false)
    }
  }

  const handleDeleteCompany = async (id: string) => {
    try {
      await companiesApi.remove(id)
      setDeleteCompanyId(null)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al desactivar')
    }
  }

  const treeName = (id?: string | null) => trees.find((t) => t.id === id)?.name ?? id ?? '—'
  const profileName = (id?: string | null) =>
    id ? (snProfiles.find((p) => p.id === id)?.name ?? id) : '—'

  const filteredCompanies = search.trim()
    ? companies.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        treeName(c.treeId).toLowerCase().includes(search.toLowerCase()),
      )
    : companies

  // ── Company CSV helpers ────────────────────────────────────────────────────
  const openCompanyCsvDialog = () => {
    setCompanyCsvRows([])
    setCompanyCsvError('')
    setCompanyImportResult(null)
    setShowCompanyCsvDialog(true)
  }

  const handleCompanyFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = parseCompanyCsv(text, trees, snProfiles)
      if (rows.length === 0) {
        setCompanyCsvError('No se encontraron filas válidas. Formato esperado: nombre,arbol,perfil_sn')
      } else {
        setCompanyCsvError('')
      }
      setCompanyCsvRows(rows)
    }
    reader.readAsText(file)
  }

  const handleImportCompaniesCsv = async () => {
    const valid = companyCsvRows.filter((r) => !r.treeError)
    if (valid.length === 0) return
    setImportingCompanyCsv(true)
    try {
      const result = await companiesApi.bulkImportCompanies(
        valid.map((r) => ({ name: r.name, treeId: r.treeId!, profileId: r.profileId ?? null })),
      )
      setCompanyImportResult(result)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setCompanyCsvError(msg || 'Error al importar')
    } finally {
      setImportingCompanyCsv(false)
    }
  }

  // ── SN Profile helpers ─────────────────────────────────────────────────────
  const openCreateSn = () => {
    setEditingSnId(null)
    setSnForm(EMPTY_SN_FORM)
    setSnFormError('')
    setShowSnDialog(true)
  }

  const openEditSn = (p: SnProfile) => {
    setEditingSnId(p.id)
    setSnForm({
      name: p.name,
      snowCompanySysId: p.snowCompanySysId,
      snowCompanyName: p.snowCompanyName,
      isActive: p.isActive ?? true,
    })
    setSnFormError('')
    setShowSnDialog(true)
  }

  const setSnField = <K extends keyof SnFormState>(key: K, value: SnFormState[K]) =>
    setSnForm((p) => ({ ...p, [key]: value }))

  const handleSaveSn = async () => {
    if (!snForm.name.trim()) { setSnFormError('El nombre es obligatorio'); return }
    if (!snForm.snowCompanySysId.trim()) { setSnFormError('El sys_id es obligatorio'); return }
    if (!snForm.snowCompanyName.trim()) { setSnFormError('El nombre en ServiceNow es obligatorio'); return }

    setSavingSn(true)
    setSnFormError('')
    try {
      if (editingSnId) {
        await companiesApi.updateSnProfile(editingSnId, {
          name: snForm.name,
          snowCompanySysId: snForm.snowCompanySysId,
          snowCompanyName: snForm.snowCompanyName,
          isActive: snForm.isActive,
        })
      } else {
        await companiesApi.createSnProfile({
          name: snForm.name,
          snowCompanySysId: snForm.snowCompanySysId,
          snowCompanyName: snForm.snowCompanyName,
        })
      }
      setShowSnDialog(false)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setSnFormError(msg || 'Error al guardar')
    } finally {
      setSavingSn(false)
    }
  }

  const handleDeleteSn = async (id: string) => {
    try {
      await companiesApi.deleteSnProfile(id)
      setDeleteSnId(null)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al eliminar perfil')
    }
  }

  const filteredSnProfiles = snSearch.trim()
    ? snProfiles.filter(
        (p) =>
          p.name.toLowerCase().includes(snSearch.toLowerCase()) ||
          p.snowCompanyName.toLowerCase().includes(snSearch.toLowerCase()) ||
          p.snowCompanySysId.toLowerCase().includes(snSearch.toLowerCase()),
      )
    : snProfiles

  // ── CSV helpers ────────────────────────────────────────────────────────────
  const openCsvDialog = () => {
    setCsvRows([])
    setCsvError('')
    setImportResult(null)
    setShowCsvDialog(true)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target?.result as string
      const rows = parseSnProfileCsv(text)
      if (rows.length === 0) {
        setCsvError('No se encontraron filas válidas. Formato esperado: nombre,sys_id,nombre_en_sn')
      } else {
        setCsvError('')
      }
      setCsvRows(rows)
    }
    reader.readAsText(file)
  }

  const handleImportCsv = async () => {
    if (csvRows.length === 0) return
    setImportingCsv(true)
    try {
      const result = await companiesApi.bulkImportSnProfiles(csvRows)
      setImportResult(result)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setCsvError(msg || 'Error al importar')
    } finally {
      setImportingCsv(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full">
      <Header title="Compañías" icon={Building2} onRefresh={load} loading={loading} />

      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* ── Bloque 1: Compañías ─────────────────────────────────────────── */}
        <div className="border rounded-lg overflow-hidden">
          {/* Section header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Compañías</span>
              <Badge variant="secondary" className="text-xs">{companies.length}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="pl-8 pr-7 h-8 w-48 text-sm"
                />
                {search && (
                  <button
                    onClick={() => setSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Button size="sm" className="h-8" onClick={openCreateCompany}>
                <Plus className="h-3.5 w-3.5" />
                Nueva
              </Button>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-11 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : companies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Building2 className="h-9 w-9 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">No hay compañías configuradas</p>
              <Button size="sm" className="mt-3" onClick={openCreateCompany}>
                <Plus className="h-3.5 w-3.5" />
                Crear primera
              </Button>
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-9 w-9 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">
                Sin resultados para <span className="font-medium">"{search}"</span>
              </p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSearch('')}>
                Limpiar búsqueda
              </Button>
            </div>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[28%]">Nombre</TableHead>
                  <TableHead className="w-[26%]">Árbol de tipos de cita</TableHead>
                  <TableHead className="w-[22%]">Perfil ServiceNow</TableHead>
                  <TableHead className="w-[12%]">Estado</TableHead>
                  <TableHead className="w-[12%]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {c.isDefault && (
                          <span title="Compañía DEFAULT">
                            <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
                          </span>
                        )}
                        <span>{c.name}</span>
                        {c.isDefault && (
                          <Badge variant="outline" className="text-xs">DEFAULT</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {treeName(c.treeId)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {profileName(c.profileId)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.isActive !== false ? 'default' : 'secondary'}>
                        {c.isActive !== false ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditCompany(c)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {!c.isDefault && (
                          <Button
                            variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => setDeleteCompanyId(c.id)} title="Desactivar"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

        {/* ── Bloque 2: Compañías ServiceNow ──────────────────────────────── */}
        <div className="border rounded-lg overflow-hidden">
          {/* Section header */}
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Compañías en ServiceNow</span>
              <Badge variant="secondary" className="text-xs">{snProfiles.length}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={snSearch}
                  onChange={(e) => setSnSearch(e.target.value)}
                  placeholder="Buscar..."
                  className="pl-8 pr-7 h-8 w-48 text-sm"
                />
                {snSearch && (
                  <button
                    onClick={() => setSnSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={handleSyncFromSn}
                disabled={syncingFromSn}
                title="Importar desde ServiceNow las compañías que aún no están registradas"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${syncingFromSn ? 'animate-spin' : ''}`} />
                {syncingFromSn ? 'Sincronizando...' : 'Sincronizar desde SN'}
              </Button>
              <Button variant="outline" size="sm" className="h-8" onClick={openCsvDialog}>
                <Upload className="h-3.5 w-3.5" />
                Importar CSV
              </Button>
              <Button size="sm" className="h-8" onClick={openCreateSn}>
                <Plus className="h-3.5 w-3.5" />
                Nueva
              </Button>
            </div>
          </div>

          {/* Sync result banner */}
          {syncResult && (
            <div className={`flex items-center justify-between px-4 py-2 text-xs border-b ${syncResult.errors > 0 ? 'bg-destructive/10 text-destructive' : 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'}`}>
              <div className="flex items-center gap-3">
                {syncResult.errors > 0
                  ? <XCircle className="h-3.5 w-3.5 shrink-0" />
                  : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                }
                <span>
                  Sincronización completada —{' '}
                  <strong>{syncResult.synced}</strong> importadas,{' '}
                  <strong>{syncResult.skipped}</strong> ya existían
                  {syncResult.errors > 0 && <>, <strong>{syncResult.errors}</strong> con errores</>}
                </span>
              </div>
              <button onClick={() => setSyncResult(null)} className="hover:opacity-70">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Content */}
          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-11 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : snProfiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Server className="h-9 w-9 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">No hay perfiles de ServiceNow</p>
              <div className="flex gap-2 mt-3">
                <Button size="sm" variant="outline" onClick={openCsvDialog}>
                  <Upload className="h-3.5 w-3.5" />
                  Importar CSV
                </Button>
                <Button size="sm" onClick={openCreateSn}>
                  <Plus className="h-3.5 w-3.5" />
                  Crear primero
                </Button>
              </div>
            </div>
          ) : filteredSnProfiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Search className="h-9 w-9 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">
                Sin resultados para <span className="font-medium">"{snSearch}"</span>
              </p>
              <Button variant="ghost" size="sm" className="mt-2" onClick={() => setSnSearch('')}>
                Limpiar búsqueda
              </Button>
            </div>
          ) : (
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[28%]">Nombre interno</TableHead>
                  <TableHead className="w-[26%]">sys_id en ServiceNow</TableHead>
                  <TableHead className="w-[22%]">Nombre en ServiceNow</TableHead>
                  <TableHead className="w-[12%]">Estado</TableHead>
                  <TableHead className="w-[12%]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSnProfiles.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="max-w-0">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded truncate block overflow-hidden" title={p.snowCompanySysId}>
                        {p.snowCompanySysId}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-0" title={p.snowCompanyName}>{p.snowCompanyName}</TableCell>
                    <TableCell>
                      <Badge variant={p.isActive !== false ? 'default' : 'secondary'}>
                        {p.isActive !== false ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditSn(p)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteSnId(p.id)} title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      {/* ── Company CSV import dialog ───────────────────────────────────────── */}
      <Dialog open={showCompanyCsvDialog} onOpenChange={(open) => { if (!open) setShowCompanyCsvDialog(false) }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Importar compañías desde CSV</DialogTitle>
            <DialogDescription>
              Columnas: <code className="text-xs bg-muted px-1 rounded">nombre,arbol,perfil_sn</code>
              {' '}— <code className="text-xs bg-muted px-1 rounded">arbol</code> y <code className="text-xs bg-muted px-1 rounded">perfil_sn</code> son nombres exactos. <code className="text-xs bg-muted px-1 rounded">perfil_sn</code> es opcional.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Archivo CSV</Label>
              <div className="flex items-center gap-3">
                <input
                  ref={companyFileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleCompanyFileChange}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => companyFileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  Seleccionar archivo
                </Button>
                {companyCsvRows.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {companyCsvRows.length} fila{companyCsvRows.length !== 1 ? 's' : ''} detectada{companyCsvRows.length !== 1 ? 's' : ''}
                    {companyCsvRows.some((r) => r.treeError) && (
                      <span className="text-destructive ml-1">
                        ({companyCsvRows.filter((r) => r.treeError).length} con error)
                      </span>
                    )}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Ejemplo: <code className="bg-muted px-1 rounded">Santander AR,DEFAULT,Santander Argentina</code>
              </p>
            </div>

            {companyCsvError && (
              <Alert variant="destructive">
                <AlertDescription>{companyCsvError}</AlertDescription>
              </Alert>
            )}

            {companyCsvRows.length > 0 && !companyImportResult && (
              <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs w-8">#</TableHead>
                      <TableHead className="text-xs">Nombre</TableHead>
                      <TableHead className="text-xs">Árbol</TableHead>
                      <TableHead className="text-xs">Perfil SN</TableHead>
                      <TableHead className="text-xs w-6"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companyCsvRows.map((row, i) => (
                      <TableRow key={i} className={row.treeError ? 'bg-destructive/5' : undefined}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-xs">{row.name}</TableCell>
                        <TableCell className="text-xs">
                          {row.treeError ? (
                            <span className="text-destructive flex items-center gap-1">
                              <XCircle className="h-3.5 w-3.5 shrink-0" />
                              {row.treeName} <span className="text-xs">(no encontrado)</span>
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                              {row.treeName}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.profileName
                            ? row.profileId
                              ? <span className="flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />{row.profileName}</span>
                              : <span className="text-amber-600 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5 shrink-0" />{row.profileName} (no encontrado, se omitirá)</span>
                            : <span className="text-muted-foreground/50">—</span>}
                        </TableCell>
                        <TableCell>
                          {row.treeError
                            ? <XCircle className="h-4 w-4 text-destructive" />
                            : <CheckCircle2 className="h-4 w-4 text-green-600" />}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {companyImportResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-700">
                    {companyImportResult.created} compañía{companyImportResult.created !== 1 ? 's' : ''} importada{companyImportResult.created !== 1 ? 's' : ''}
                  </span>
                </div>
                {companyImportResult.errors.length > 0 && (
                  <div className="border rounded-md p-3 space-y-1 bg-destructive/5">
                    <p className="text-xs font-medium text-destructive flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5" />
                      {companyImportResult.errors.length} error{companyImportResult.errors.length !== 1 ? 'es' : ''}:
                    </p>
                    {companyImportResult.errors.map((e, i) => (
                      <p key={i} className="text-xs text-muted-foreground">Fila {e.row}: {e.message}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompanyCsvDialog(false)}>
              {companyImportResult ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!companyImportResult && (
              <Button
                onClick={handleImportCompaniesCsv}
                disabled={companyCsvRows.every((r) => r.treeError) || importingCompanyCsv}
              >
                {importingCompanyCsv
                  ? 'Importando...'
                  : `Importar ${companyCsvRows.filter((r) => !r.treeError).length} compañía${companyCsvRows.filter((r) => !r.treeError).length !== 1 ? 's' : ''}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Company create/edit dialog ──────────────────────────────────────── */}
      <Dialog open={showCompanyDialog} onOpenChange={setShowCompanyDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingCompanyId ? 'Editar compañía' : 'Nueva compañía'}</DialogTitle>
            <DialogDescription>
              Configura la compañía, su árbol de tipos de cita y el perfil de ServiceNow.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={companyForm.name}
                onChange={(e) => setCompanyField('name', e.target.value)}
                placeholder="Santander Corporate"
              />
            </div>

            <div className="space-y-2">
              <Label>Árbol de tipos de cita *</Label>
              <Select value={companyForm.treeId} onValueChange={(v) => setCompanyField('treeId', v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar árbol" />
                </SelectTrigger>
                <SelectContent>
                  {trees.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Compañía en ServiceNow</Label>
              <Select
                value={companyForm.profileId ?? '__none__'}
                onValueChange={(v) => setCompanyField('profileId', v === '__none__' ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin perfil (usa default SN)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin perfil (usa default SN)</SelectItem>
                  {snProfiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.snowCompanyName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {editingCompanyId && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={companyForm.isActive}
                  onChange={(e) => setCompanyField('isActive', e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="isActive">Activa</Label>
              </div>
            )}
          </div>

          {companyFormError && (
            <Alert variant="destructive">
              <AlertDescription>{companyFormError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCompanyDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveCompany} disabled={savingCompany}>
              {savingCompany ? 'Guardando...' : editingCompanyId ? 'Guardar cambios' : 'Crear compañía'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Company delete confirm ──────────────────────────────────────────── */}
      <Dialog open={!!deleteCompanyId} onOpenChange={(open) => !open && setDeleteCompanyId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desactivar compañía</DialogTitle>
            <DialogDescription>
              La compañía será desactivada. Los datos existentes no se eliminarán.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteCompanyId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteCompanyId && handleDeleteCompany(deleteCompanyId)}>
              Desactivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SN Profile create/edit dialog ──────────────────────────────────── */}
      <Dialog open={showSnDialog} onOpenChange={setShowSnDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSnId ? 'Editar perfil ServiceNow' : 'Nuevo perfil ServiceNow'}
            </DialogTitle>
            <DialogDescription>
              Vincula un nombre interno con el sys_id y nombre de la compañía en ServiceNow.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre interno *</Label>
              <Input
                value={snForm.name}
                onChange={(e) => setSnField('name', e.target.value)}
                placeholder="Santander Argentina"
              />
              <p className="text-xs text-muted-foreground">Nombre de referencia dentro del sistema</p>
            </div>

            <div className="space-y-2">
              <Label>sys_id en ServiceNow *</Label>
              <Input
                value={snForm.snowCompanySysId}
                onChange={(e) => setSnField('snowCompanySysId', e.target.value)}
                placeholder="a1b2c3d4e5f6..."
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                ID único de la compañía en ServiceNow (campo <code>sys_id</code>)
              </p>
            </div>

            <div className="space-y-2">
              <Label>Nombre en ServiceNow *</Label>
              <Input
                value={snForm.snowCompanyName}
                onChange={(e) => setSnField('snowCompanyName', e.target.value)}
                placeholder="Santander S.A."
              />
              <p className="text-xs text-muted-foreground">Nombre tal como aparece en ServiceNow</p>
            </div>

            {editingSnId && (
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="snIsActive"
                  checked={snForm.isActive}
                  onChange={(e) => setSnField('isActive', e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <Label htmlFor="snIsActive">Activo</Label>
              </div>
            )}
          </div>

          {snFormError && (
            <Alert variant="destructive">
              <AlertDescription>{snFormError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSnDialog(false)}>Cancelar</Button>
            <Button onClick={handleSaveSn} disabled={savingSn}>
              {savingSn ? 'Guardando...' : editingSnId ? 'Guardar cambios' : 'Crear perfil'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── SN Profile delete confirm ───────────────────────────────────────── */}
      <Dialog open={!!deleteSnId} onOpenChange={(open) => !open && setDeleteSnId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar perfil ServiceNow</DialogTitle>
            <DialogDescription>
              El perfil será desactivado. Las compañías que lo usen quedarán sin perfil asignado.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteSnId(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => deleteSnId && handleDeleteSn(deleteSnId)}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── CSV import dialog ───────────────────────────────────────────────── */}
      <Dialog open={showCsvDialog} onOpenChange={(open) => { if (!open) setShowCsvDialog(false) }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar perfiles ServiceNow desde CSV</DialogTitle>
            <DialogDescription>
              El archivo debe tener columnas: <code className="text-xs bg-muted px-1 rounded">nombre,sys_id,nombre_en_sn</code>
              {' '}(con o sin fila de encabezado).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* File input */}
            <div className="space-y-2">
              <Label>Archivo CSV</Label>
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  Seleccionar archivo
                </Button>
                {csvRows.length > 0 && (
                  <span className="text-sm text-muted-foreground">
                    {csvRows.length} fila{csvRows.length !== 1 ? 's' : ''} detectada{csvRows.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Ejemplo: <code className="bg-muted px-1 rounded">Santander AR,abc123sys,Santander Argentina S.A.</code>
              </p>
            </div>

            {csvError && (
              <Alert variant="destructive">
                <AlertDescription>{csvError}</AlertDescription>
              </Alert>
            )}

            {/* Preview table */}
            {csvRows.length > 0 && !importResult && (
              <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">#</TableHead>
                      <TableHead className="text-xs">Nombre</TableHead>
                      <TableHead className="text-xs">sys_id</TableHead>
                      <TableHead className="text-xs">Nombre en SN</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {csvRows.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="text-xs">{row.name}</TableCell>
                        <TableCell className="text-xs font-mono">{row.snowCompanySysId}</TableCell>
                        <TableCell className="text-xs">{row.snowCompanyName}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Import result */}
            {importResult && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-700">{importResult.created} perfil{importResult.created !== 1 ? 'es' : ''} importado{importResult.created !== 1 ? 's' : ''}</span>
                </div>
                {importResult.errors.length > 0 && (
                  <div className="border rounded-md p-3 space-y-1 bg-destructive/5">
                    <p className="text-xs font-medium text-destructive flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5" />
                      {importResult.errors.length} error{importResult.errors.length !== 1 ? 'es' : ''}:
                    </p>
                    {importResult.errors.map((e, i) => (
                      <p key={i} className="text-xs text-muted-foreground">
                        Fila {e.row}: {e.message}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCsvDialog(false)}>
              {importResult ? 'Cerrar' : 'Cancelar'}
            </Button>
            {!importResult && (
              <Button
                onClick={handleImportCsv}
                disabled={csvRows.length === 0 || importingCsv}
              >
                {importingCsv ? 'Importando...' : `Importar ${csvRows.length} perfil${csvRows.length !== 1 ? 'es' : ''}`}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
