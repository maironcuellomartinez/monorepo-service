import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  fetchClient,
  rotateSecret,
  deactivateClient,
  updateTokenExpiry,
  Client,
  CreateClientResult,
} from '../lib/api';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '../components/ui/dialog';
import { Alert, AlertTitle, AlertDescription } from '../components/ui/alert';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Separator } from '../components/ui/separator';
import {
  ArrowLeft,
  Clock,
  RotateCw,
  PowerOff,
  X,
  Check,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';

function formatExpiry(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const [client, setClient]             = useState<Client | null>(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);
  const [secretResult, setSecretResult] = useState<CreateClientResult | null>(null);
  const [expiryDialogOpen, setExpiryDialogOpen]   = useState(false);
  const [rotateDialogOpen, setRotateDialogOpen]   = useState(false);
  const [deactivateDialogOpen, setDeactivateDialogOpen] = useState(false);
  const [expiryValue, setExpiryValue]   = useState(3600);
  const [savingExpiry, setSavingExpiry] = useState(false);
  const [rotating, setRotating]         = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  const loadClient = async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchClient(clientId);
      setClient(data);
      setExpiryValue(data.tokenExpiresInSeconds);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error al cargar el cliente');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadClient(); }, [clientId]);

  const handleRotate = async () => {
    if (!clientId) return;
    setRotating(true);
    try {
      const result = await rotateSecret(clientId);
      setSecretResult(result);
      setRotateDialogOpen(false);
      loadClient();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al rotar el secret');
    } finally {
      setRotating(false);
    }
  };

  const handleDeactivate = async () => {
    if (!clientId) return;
    setDeactivating(true);
    try {
      await deactivateClient(clientId);
      setDeactivateDialogOpen(false);
      loadClient();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al desactivar el cliente');
    } finally {
      setDeactivating(false);
    }
  };

  const handleSaveExpiry = async () => {
    if (!clientId) return;
    setSavingExpiry(true);
    try {
      await updateTokenExpiry(clientId, expiryValue);
      setExpiryDialogOpen(false);
      loadClient();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al actualizar el token expiry');
    } finally {
      setSavingExpiry(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="flex items-center justify-center h-64 text-muted-foreground">
          Cargando cliente...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="space-y-4">
        <BackLink />
        <Alert variant="warning">
          <AlertTitle>No encontrado</AlertTitle>
          <AlertDescription>El cliente no existe</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackLink />

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <CardTitle className="text-xl">{client.name}</CardTitle>
              <p className="mt-1 font-mono text-sm text-muted-foreground truncate">
                {client.clientId}
              </p>
            </div>
            <Badge variant={client.isActive ? 'success' : 'destructive'} className="shrink-0">
              {client.isActive ? 'Activo' : 'Inactivo'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {client.description && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Descripción</p>
              <p className="mt-1 text-sm text-foreground">{client.description}</p>
            </div>
          )}

          <Separator />

          <div className="grid grid-cols-2 gap-x-8 gap-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Creado</p>
              <p className="mt-1 text-sm">{new Date(client.createdAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actualizado</p>
              <p className="mt-1 text-sm">{new Date(client.updatedAt).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duración del token</p>
              <p className="mt-1 text-sm">{formatExpiry(client.tokenExpiresInSeconds)}</p>
            </div>
            {client.allowedScopes && client.allowedScopes.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scopes</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {client.allowedScopes.map((s) => (
                    <Badge key={s} variant="secondary" className="font-mono text-xs">{s}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {secretResult && (
        <Alert variant="warning" className="relative pr-10">
          <KeyRound className="h-4 w-4" />
          <AlertTitle>Secret rotado exitosamente</AlertTitle>
          <AlertDescription>
            <p className="mt-1 break-all">
              <code className="font-mono bg-yellow-100 dark:bg-yellow-900/40 px-1 rounded">
                {secretResult.clientSecret}
              </code>
            </p>
            <p className="mt-1 text-xs opacity-70">
              Guardá este secret — no se mostrará nuevamente.
            </p>
          </AlertDescription>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-2 h-6 w-6 text-yellow-700 dark:text-yellow-300 hover:bg-yellow-200/50"
            onClick={() => setSecretResult(null)}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </Alert>
      )}

      {client.isActive && (
        <div className="flex flex-wrap gap-3">
          {/* Dialog: Editar duración del token */}
          <Dialog open={expiryDialogOpen} onOpenChange={setExpiryDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Clock className="mr-2 h-4 w-4" />
                Editar expiración
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Duración del token</DialogTitle>
                <DialogDescription>
                  Ingresá los segundos de vigencia del access token (mín: 3600 = 1h · máx: 604800 = 7d).
                </DialogDescription>
              </DialogHeader>
              <div className="py-4 space-y-2">
                <Label htmlFor="expiry-seconds">Segundos</Label>
                <Input
                  id="expiry-seconds"
                  type="number"
                  min={3600}
                  max={604800}
                  value={expiryValue}
                  onChange={(e) => setExpiryValue(parseInt(e.target.value) || 3600)}
                />
                <p className="text-xs text-muted-foreground">
                  Valor actual: {formatExpiry(client.tokenExpiresInSeconds)}
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setExpiryDialogOpen(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
                <Button onClick={handleSaveExpiry} disabled={savingExpiry}>
                  <Check className="mr-2 h-4 w-4" />
                  {savingExpiry ? 'Guardando...' : 'Guardar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog: Rotar secret */}
          <Dialog open={rotateDialogOpen} onOpenChange={setRotateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <RotateCw className="mr-2 h-4 w-4" />
                Rotar secret
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <RotateCw className="h-5 w-5" />
                  Rotar secret
                </DialogTitle>
                <DialogDescription>
                  Se invalidará el secret actual de <strong>{client.name}</strong>. Cualquier servicio que use el secret anterior perderá acceso de inmediato.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRotateDialogOpen(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleRotate} disabled={rotating}>
                  <RotateCw className="mr-2 h-4 w-4" />
                  {rotating ? 'Rotando...' : 'Rotar secret'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Dialog: Desactivar cliente */}
          <Dialog open={deactivateDialogOpen} onOpenChange={setDeactivateDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive">
                <PowerOff className="mr-2 h-4 w-4" />
                Desactivar cliente
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Desactivar cliente
                </DialogTitle>
                <DialogDescription>
                  El cliente <strong>{client.name}</strong> perderá acceso inmediatamente y no podrá obtener nuevos tokens. Podés reactivarlo más tarde desde la lista de clientes.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDeactivateDialogOpen(false)}>
                  <X className="mr-2 h-4 w-4" />
                  Cancelar
                </Button>
                <Button variant="destructive" onClick={handleDeactivate} disabled={deactivating}>
                  <PowerOff className="mr-2 h-4 w-4" />
                  {deactivating ? 'Desactivando...' : 'Desactivar'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      to="/clients"
      className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors"
    >
      <ArrowLeft className="h-4 w-4" />
      Volver a clientes
    </Link>
  );
}
