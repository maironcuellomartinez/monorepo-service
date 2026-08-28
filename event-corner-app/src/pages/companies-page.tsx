import { useEffect, useState } from 'react'
import {
  Building2, AlertCircle, Pencil, Search, X, Server,
  CheckCircle2, XCircle, RefreshCw, TriangleAlert,
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
import { companiesApi, Company, IssueTypeTree } from '@/lib/api'

export function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [trees, setTrees] = useState<IssueTypeTree[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null)
  const [editTreeId, setEditTreeId] = useState<string>('')
  const [editIsActive, setEditIsActive] = useState(true)
  const [savingCompany, setSavingCompany] = useState(false)
  const [companyFormError, setCompanyFormError] = useState('')

  const [syncingFromSn, setSyncingFromSn] = useState(false)
  const [syncResult, setSyncResult] = useState<{ synced: number; skipped: number; errors: number; companiesCreated: number; companiesLinked: number } | null>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [data, treesData] = await Promise.all([
        companiesApi.list(),
        companiesApi.listTrees(),
      ])
      setCompanies(data)
      setTrees(treesData)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setError(msg || 'Error al cargar compañías')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

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

  const openEditCompany = (c: Company) => {
    setEditingCompanyId(c.id)
    setEditTreeId(c.treeId ?? '')
    setEditIsActive(c.isActive ?? true)
    setCompanyFormError('')
  }

  const handleSaveCompany = async () => {
    if (!editingCompanyId) return
    setSavingCompany(true)
    setCompanyFormError('')
    try {
      await companiesApi.update(editingCompanyId, {
        treeId: editTreeId || null,
        isActive: editIsActive,
      })
      setEditingCompanyId(null)
      await load()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      setCompanyFormError(msg || 'Error al guardar')
    } finally {
      setSavingCompany(false)
    }
  }

  const treeName = (id: string | null) => (id ? trees.find((t) => t.id === id)?.name ?? id : null)

  const filteredCompanies = search.trim()
    ? companies.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.snowCompanySysId ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : companies

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

        <div className="border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <Server className="h-4 w-4 text-muted-foreground" />
              <span className="font-semibold text-sm">Compañías en ServiceNow</span>
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
            </div>
          </div>

          {syncResult && (
            <div className={`flex items-center justify-between px-4 py-2 text-xs border-b ${syncResult.errors > 0 ? 'bg-destructive/10 text-destructive' : 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400'}`}>
              <div className="flex items-center gap-3">
                {syncResult.errors > 0
                  ? <XCircle className="h-3.5 w-3.5 shrink-0" />
                  : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                }
                <span>
                  Sincronización completada —{' '}
                  <strong>{syncResult.synced}</strong> perfiles importados,{' '}
                  <strong>{syncResult.companiesCreated}</strong> compañías nuevas,{' '}
                  <strong>{syncResult.companiesLinked}</strong> vinculadas a compañías existentes,{' '}
                  <strong>{syncResult.skipped}</strong> ya existían
                  {syncResult.errors > 0 && <>, <strong>{syncResult.errors}</strong> con errores</>}
                </span>
              </div>
              <button onClick={() => setSyncResult(null)} className="hover:opacity-70">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-11 bg-muted animate-pulse rounded" />
              ))}
            </div>
          ) : companies.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Server className="h-9 w-9 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm">No hay compañías sincronizadas todavía</p>
              <Button size="sm" className="mt-3" onClick={handleSyncFromSn} disabled={syncingFromSn}>
                <RefreshCw className={`h-3.5 w-3.5 ${syncingFromSn ? 'animate-spin' : ''}`} />
                Sincronizar desde SN
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
                  <TableHead className="w-[24%]">Nombre (ServiceNow)</TableHead>
                  <TableHead className="w-[22%]">sys_id en ServiceNow</TableHead>
                  <TableHead className="w-[22%]">Árbol de tipos de cita</TableHead>
                  <TableHead className="w-[16%]">Estado</TableHead>
                  <TableHead className="w-[16%]">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCompanies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="max-w-0">
                      <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded truncate block overflow-hidden" title={c.snowCompanySysId ?? undefined}>
                        {c.snowCompanySysId ?? '—'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {c.treeId ? (
                        <Badge variant="secondary" className="font-mono text-xs">
                          {treeName(c.treeId)}
                        </Badge>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
                          <TriangleAlert className="h-3.5 w-3.5" />
                          Sin árbol asignado
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.isActive !== false ? 'default' : 'secondary'}>
                        {c.isActive !== false ? 'Activa' : 'Inactiva'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditCompany(c)} title="Editar">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog open={!!editingCompanyId} onOpenChange={(open) => { if (!open) setEditingCompanyId(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar compañía</DialogTitle>
            <DialogDescription>
              El nombre y el vínculo con ServiceNow se gestionan por sincronización — acá solo se asigna el árbol de tipos de cita y el estado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Árbol de tipos de cita</Label>
              <Select value={editTreeId || '__none__'} onValueChange={(v) => setEditTreeId(v === '__none__' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin árbol asignado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sin árbol asignado</SelectItem>
                  {trees.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Sin árbol asignado, esta compañía no puede usarse para crear citas.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={editIsActive}
                onChange={(e) => setEditIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-input"
              />
              <Label htmlFor="isActive">Activa</Label>
            </div>
          </div>

          {companyFormError && (
            <Alert variant="destructive">
              <AlertDescription>{companyFormError}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCompanyId(null)}>Cancelar</Button>
            <Button onClick={handleSaveCompany} disabled={savingCompany}>
              {savingCompany ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
