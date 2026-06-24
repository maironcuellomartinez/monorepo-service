import { useState, useEffect } from 'react';
import {
  fetchToken,
  getAccessToken,
  clearAccessToken,
  setAccessToken,
} from '../lib/api';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription } from './ui/alert';

export default function OAuthTokenPanel() {
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [scope, setScope] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokenInfo, setTokenInfo] = useState<{
    accessToken: string;
    expiresIn: number;
  } | null>(null);

  const activeToken = getAccessToken();

  useEffect(() => {
    if (activeToken) {
      setTokenInfo({ accessToken: activeToken, expiresIn: 0 });
    }
  }, []);

  const handleGetToken = async () => {
    if (!clientId || !clientSecret) {
      setError('clientId and clientSecret are required');
      return;
    }

    setLoading(true);
    setError(null);
    setTokenInfo(null);

    try {
      const res = await fetchToken(clientId, clientSecret, scope || undefined);
      setAccessToken(res.access_token);
      setTokenInfo({ accessToken: res.access_token, expiresIn: res.expires_in });
    } catch (err: unknown) {
      let msg = 'Failed to fetch token';
      if (err && typeof err === 'object' && 'response' in err) {
        const data = (err as { response?: { data?: Record<string, unknown> } }).response?.data;
        msg = (data?.error_description ?? data?.error ?? data?.message ?? msg) as string;
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleClearToken = () => {
    clearAccessToken();
    setTokenInfo(null);
    setError(null);
  };

  const truncateToken = (token: string) => {
    if (token.length <= 20) return token;
    return `${token.slice(0, 5)}...${token.slice(-10)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">OAuth Token</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {activeToken && tokenInfo ? (
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Active token:</span>{' '}
              <code className="bg-muted px-1 rounded text-xs">
                {truncateToken(tokenInfo.accessToken)}
              </code>
            </div>
            {tokenInfo.expiresIn > 0 && (
              <div className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Expires in:</span>{' '}
                {tokenInfo.expiresIn}s
              </div>
            )}
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={handleClearToken}
            >
              Clear Token
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="oauth-clientId" className="text-xs">
                Client ID
              </Label>
              <Input
                id="oauth-clientId"
                placeholder="mc_..."
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="oauth-clientSecret" className="text-xs">
                Client Secret
              </Label>
              <Input
                id="oauth-clientSecret"
                type="password"
                placeholder="••••••••"
                value={clientSecret}
                onChange={(e) => setClientSecret(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="oauth-scope" className="text-xs">
                Scope (optional)
              </Label>
              <Input
                id="oauth-scope"
                placeholder="read write"
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={handleGetToken}
              disabled={loading}
            >
              {loading ? 'Requesting...' : 'Get Token'}
            </Button>
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="py-2">
            <AlertDescription className="text-xs">{error}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
