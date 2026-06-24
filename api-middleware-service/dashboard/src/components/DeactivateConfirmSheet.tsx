import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from './ui/sheet';
import { Button } from './ui/button';
import { Client } from '../lib/api';

interface DeactivateConfirmSheetProps {
  client: Client | null;
  onConfirm: (clientId: string) => void;
  onCancel: () => void;
}

export default function DeactivateConfirmSheet({ client, onConfirm, onCancel }: DeactivateConfirmSheetProps) {
  return (
    <Sheet open={client !== null} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Deactivate Client</SheetTitle>
        </SheetHeader>

        <div className="py-4 text-sm text-muted-foreground">
          Are you sure you want to deactivate {client?.name} ({client?.clientId})?
        </div>

        <div className="absolute bottom-6 left-6 right-6 flex flex-col gap-3">
          <Button
            variant="destructive"
            className="w-full"
            onClick={() => {
              if (client) onConfirm(client.clientId);
            }}
          >
            Confirm Deactivate
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            onClick={onCancel}
          >
            Cancel
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
