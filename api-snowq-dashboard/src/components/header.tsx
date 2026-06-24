import { Bell, RefreshCcw, User } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onRefresh?: () => void;
  lastUpdated?: Date;
}

export function Header({ onRefresh, lastUpdated }: HeaderProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-6">
      <div className="flex items-center gap-4">
        {lastUpdated && (
          <span className="text-xs text-muted-foreground">
            Actualizado: {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={onRefresh}>
          <RefreshCcw className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon">
          <Bell className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon">
          <User className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
