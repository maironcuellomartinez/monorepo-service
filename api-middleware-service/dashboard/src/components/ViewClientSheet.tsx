import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './ui/sheet';
import { ScrollArea } from './ui/scroll-area';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import { fetchClient, updateTokenExpiry, Client } from '../lib/api';
import { Pencil, Check, X } from 'lucide-react';

function formatExpiry(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface ViewClientSheetProps {
  clientId: string | null;
  onClose: () => void;
}

export default function ViewClientSheet({ clientId, onClose }: ViewClientSheetProps) {
  const [client, setClient]           = useState<Client | null>(null);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [editingExpiry, setEditingExpiry] = useState(false);
  const [expiryValue, setExpiryValue] = useState(3600);
  const [savingExpiry, setSavingExpiry] = useState(false);

  const loadClient = async () => {
    if (!clientId) return;
    setLoading(true);
    setError(null);
    setClient(null);
    setEditingExpiry(false);
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

  const handleSaveExpiry = async () => {
    if (!clientId || !client) return;
    setSavingExpiry(true);
    try {
      await updateTokenExpiry(clientId, expiryValue);
      setEditingExpiry(false);
      loadClient();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Error al actualizar el token expiry');
    } finally {
      setSavingExpiry(false);
    }
  };

  return (
    <Sheet open={clientId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent side="right" className="flex flex-col w-96 p-0">
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <SheetTitle>Detalles del cliente</SheetTitle>
          {client && (
            <SheetDescription className="font-mono text-xs truncate">
              {client.clientId}
            </SheetDescription>
          )}
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-4 space-y-5">
            {loading && (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Cargando detalles...
              </p>
            )}

            {error && (
              <p className="text-sm text-destructive py-4">{error}</p>
            )}

            {!loading && !error && client && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-muted-foreground">Estado</span>
                  <Badge variant={client.isActive ? 'success' : 'destructive'}>
                    {client.isActive ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>

                <Separator />

                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Nombre</span>
                  <p className="text-sm font-medium">{client.name}</p>
                </div>

                {client.description && (
                  <div className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Descripción</span>
                    <p className="text-sm text-foreground">{client.description}</p>
                  </div>
                )}

                <Separator />

                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Duración del token</span>
                  {editingExpiry ? (
                    <div className="space-y-3 pt-1">
                      <div className="space-y-1.5">
                        <Label htmlFor="expiry-input" className="text-xs text-muted-foreground">
                          Segundos (mín: 3600 = 1h · máx: 604800 = 7d)
                        </Label>
                        <Input
                          id="expiry-input"
                          type="number"
                          min={3600}
                          max={604800}
                          value={expiryValue}
                          onChange={(e) => setExpiryValue(parseInt(e.target.value) || 3600)}
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveExpiry} disabled={savingExpiry}>
                          <Check className="mr-1.5 h-3.5 w-3.5" />
                          {savingExpiry ? 'Guardando...' : 'Guardar'}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingExpiry(false)}>
                          <X className="mr-1.5 h-3.5 w-3.5" />
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-sm">{formatExpiry(client.tokenExpiresInSeconds)}</span>
                      {client.isActive && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => setEditingExpiry(true)}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          Editar
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scopes permitidos</span>
                  {client.allowedScopes && client.allowedScopes.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {client.allowedScopes.map((s) => (
                        <Badge key={s} variant="secondary" className="font-mono text-xs">{s}</Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sin restricciones</p>
                  )}
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Creado</span>
                    <p className="text-xs text-muted-foreground">
                      {new Date(client.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Actualizado</span>
                    <p className="text-xs text-muted-foreground">
                      {new Date(client.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
