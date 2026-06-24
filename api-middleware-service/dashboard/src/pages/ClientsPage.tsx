import { useEffect, useState, type FormEvent } from 'react';
import {
  fetchClients,
  createClient,
  rotateSecret,
  deactivateClient,
  reactivateClient,
  deleteClient,
  Client,
  CreateClientPayload,
  CreateClientResult,
} from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '../components/ui/alert';
import { Card, CardContent } from '../components/ui/card';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '../components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../components/ui/dialog';
import {
  Plus,
  Eye,
  RotateCw,
  PowerOff,
  Power,
  Trash2,
  X,
  CheckCircle,
  KeyRound,
  AlertTriangle,
  ShieldCheck,
} from 'lucide-react';
import ViewClientSheet from '../components/ViewClientSheet';

export default function ClientsPage() {
  const [clients, setClients]           = useState<Client[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [createResult, setCreateResult] = useState<CreateClientResult | null>(null);
  const [rotateResult, setRotateResult] = useState<CreateClientResult | null>(null);
  const [rotateTarget, setRotateTarget] = useState<string | null>(null);
  const [viewClientId, setViewClientId] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<Client | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  const loadClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClients();
      setClients(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load clients');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadClients(); }, []);

  const handleCreate = async (payload: CreateClientPayload) => {
    try {
      const result = await createClient(payload);
      setCreateResult(result);
      setShowCreate(false);
      loadClients();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to create client');
    }
  };

  const handleConfirmRotate = async () => {
    if (!rotateTarget) return;
    try {
      const result = await rotateSecret(rotateTarget);
      setRotateResult(result);
      setRotateTarget(null);
      loadClients();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to rotate secret');
      setRotateTarget(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteClient(deleteTarget.clientId);
      setDeleteTarget(null);
      loadClients();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al eliminar el cliente');
      setDeleteTarget(null);
    }
  };

  const handleToggleStatus = async () => {
    if (!statusTarget) return;
    try {
      if (statusTarget.isActive) {
        await deactivateClient(statusTarget.clientId);
      } else {
        await reactivateClient(statusTarget.clientId);
      }
      setStatusTarget(null);
      loadClients();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al cambiar estado del cliente');
      setStatusTarget(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Clients</h2>
        <Button onClick={() => { setShowCreate(true); setCreateResult(null); }}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo cliente
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {createResult && (
        <Alert variant="warning" className="relative pr-10">
          <ShieldCheck className="h-4 w-4" />
          <AlertTitle>Cliente creado exitosamente</AlertTitle>
          <AlertDescription>
            <p className="mt-1">
              Client ID: <code className="font-mono bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded">{createResult.clientId}</code>
            </p>
            <p>
              Client Secret: <code className="font-mono bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded break-all">{createResult.clientSecret}</code>
            </p>
            <p className="mt-1 text-xs opacity-70">
              Guardá este secret — no se mostrará nuevamente.
            </p>
          </AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-6 w-6 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200/50"
            onClick={() => setCreateResult(null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </Alert>
      )}

      {rotateResult && (
        <Alert variant="warning" className="relative pr-10">
          <KeyRound className="h-4 w-4" />
          <AlertTitle>Secret rotado exitosamente</AlertTitle>
          <AlertDescription>
            <p className="mt-1">
              Nuevo secret: <code className="font-mono bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded break-all">{rotateResult.clientSecret}</code>
            </p>
            <p className="mt-1 text-xs opacity-70">
              Guardá este secret — no se mostrará nuevamente.
            </p>
          </AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-6 w-6 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200/50"
            onClick={() => setRotateResult(null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              Cargando clientes...
            </div>
          ) : clients.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-muted-foreground">
              No hay clientes registrados
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client ID</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((client) => (
                  <TableRow key={client.clientId}>
                    <TableCell>
                      <span className="font-mono text-xs text-muted-foreground">
                        {client.clientId}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium">{client.name}</TableCell>
                    <TableCell>
                      <Badge variant={client.isActive ? 'success' : 'destructive'}>
                        {client.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(client.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setViewClientId(client.clientId)}
                        >
                          <Eye className="mr-1.5 h-3.5 w-3.5" />
                          Ver
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRotateTarget(client.clientId)}
                        >
                          <RotateCw className="mr-1.5 h-3.5 w-3.5" />
                          Rotar
                        </Button>
                        {client.isActive ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => setStatusTarget(client)}
                          >
                            <PowerOff className="mr-1.5 h-3.5 w-3.5" />
                            Desactivar
                          </Button>
                        ) : (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setStatusTarget(client)}
                            >
                              <Power className="mr-1.5 h-3.5 w-3.5" />
                              Reactivar
                            </Button>
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setDeleteTarget(client)}
                            >
                              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                              Eliminar
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <ViewClientSheet
        clientId={viewClientId}
        onClose={() => setViewClientId(null)}
      />

      {/* Dialog: Crear cliente */}
      <Dialog open={showCreate} onOpenChange={(open) => { if (!open) setShowCreate(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
            <DialogDescription>
              Registrá una nueva aplicación externa para acceder a la API mediante OAuth2.
            </DialogDescription>
          </DialogHeader>
          <CreateClientForm
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog: Cambio de estado */}
      <Dialog open={statusTarget !== null} onOpenChange={(open) => { if (!open) setStatusTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {statusTarget?.isActive
                ? <><PowerOff className="h-5 w-5 text-destructive" /> Desactivar cliente</>
                : <><Power className="h-5 w-5 text-primary" /> Reactivar cliente</>
              }
            </DialogTitle>
            <DialogDescription>
              {statusTarget?.isActive
                ? <>¿Seguro que querés desactivar <strong>{statusTarget.name}</strong>? El cliente perderá acceso inmediatamente y no podrá obtener nuevos tokens.</>
                : <>¿Querés reactivar <strong>{statusTarget?.name}</strong>? El cliente podrá volver a autenticarse con sus credenciales existentes.</>
              }
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStatusTarget(null)}>
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            <Button
              variant={statusTarget?.isActive ? 'destructive' : 'default'}
              onClick={handleToggleStatus}
            >
              {statusTarget?.isActive
                ? <><PowerOff className="mr-2 h-4 w-4" /> Desactivar</>
                : <><CheckCircle className="mr-2 h-4 w-4" /> Reactivar</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Eliminación permanente */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Eliminar cliente permanentemente
            </DialogTitle>
            <DialogDescription>
              Esta acción <strong>no se puede deshacer</strong>. El cliente{' '}
              <strong>{deleteTarget?.name}</strong> y todas sus credenciales serán eliminados
              de la base de datos. Los tokens emitidos dejarán de funcionar.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              <Trash2 className="mr-2 h-4 w-4" />
              Eliminar definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Rotación de secret */}
      <Dialog open={rotateTarget !== null} onOpenChange={(open) => { if (!open) setRotateTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCw className="h-5 w-5" />
              Rotar secret
            </DialogTitle>
            <DialogDescription>
              Se invalidará el secret actual de <strong>{rotateTarget}</strong>. Cualquier servicio que use el secret anterior perderá acceso de inmediato.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRotateTarget(null)}>
              <X className="mr-2 h-4 w-4" />
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleConfirmRotate}>
              <RotateCw className="mr-2 h-4 w-4" />
              Rotar secret
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateClientForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (payload: CreateClientPayload) => void;
  onCancel: () => void;
}) {
  const [name, setName]               = useState('');
  const [description, setDescription] = useState('');
  const [scopesInput, setScopesInput] = useState('');
  const [tokenExpiry, setTokenExpiry] = useState(3600);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const scopes = scopesInput
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const payload: CreateClientPayload = { clientName: name.trim(), tokenExpiresInSeconds: tokenExpiry };
    if (description.trim()) payload.description = description.trim();
    if (scopes.length > 0) payload.scopes = scopes;
    onSubmit(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="space-y-2">
        <Label htmlFor="name">Nombre del cliente *</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Mi aplicación"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción opcional"
          className="resize-none"
          rows={3}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="tokenExpiry">Expiración del token (segundos)</Label>
        <Input
          id="tokenExpiry"
          type="number"
          min={3600}
          max={604800}
          step={3600}
          value={tokenExpiry}
          onChange={(e) => setTokenExpiry(Number(e.target.value))}
        />
        <p className="text-xs text-muted-foreground">
          Mín. 3600 (1h) — Máx. 604800 (7 días). Default: 3600.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="scopes">Scopes permitidos</Label>
        <Input
          id="scopes"
          value={scopesInput}
          onChange={(e) => setScopesInput(e.target.value)}
          placeholder="records:read incidents:read"
        />
        <p className="text-xs text-muted-foreground">
          Dejá vacío para permitir todos los scopes. Separar con espacios o comas.
        </p>
      </div>
      <DialogFooter className="pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          <X className="mr-2 h-4 w-4" />
          Cancelar
        </Button>
        <Button type="submit">
          <Plus className="mr-2 h-4 w-4" />
          Crear cliente
        </Button>
      </DialogFooter>
    </form>
  );
}
