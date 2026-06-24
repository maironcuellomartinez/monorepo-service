import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { checkSession } from '../lib/api';

export default function ProtectedRoute() {
  const [session, setSession] = useState<{ username: string } | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    checkSession().then((result) => {
      if (!cancelled) setSession(result);
    });
    return () => { cancelled = true; };
  }, []);

  if (session === undefined) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">Verifying session...</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
