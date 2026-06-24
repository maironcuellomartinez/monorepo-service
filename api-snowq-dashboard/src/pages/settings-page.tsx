import { useState } from 'react'
import axios from 'axios'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConfig } from '@/contexts/config-context'
import { CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react'

export default function SettingsPage() {
  const { config, saveConfig } = useConfig()
  const [apiUrl, setApiUrl] = useState(config.apiUrl)
  const [apiToken, setApiToken] = useState(config.apiToken)
  const [showToken, setShowToken] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saved, setSaved] = useState(false)

  const save = () => {
    saveConfig({ apiUrl, apiToken })
    setSaved(true)
    setTestResult(null)
    setTimeout(() => setSaved(false), 2000)
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      // Test sin token primero para ver si el endpoint es público
      const tempClient = axios.create({
        baseURL: apiUrl,
        headers: { 'Content-Type': 'application/json' },
      })
      if (apiToken) {
        tempClient.defaults.headers.common['Authorization'] = `Bearer ${apiToken}`
      }
      await tempClient.get('/health/live')
      const hasValidToken = apiToken ? true : false
      setTestResult({ 
        ok: true, 
        message: hasValidToken 
          ? 'Conexión exitosa - Token válido ✅' 
          : 'Conexión exitosa - Endpoint público (sin auth)'
      })
    } catch (e: any) {
      if (e?.response?.status === 401) {
        setTestResult({ ok: false, message: 'Token inválido o expirado ❌' })
      } else {
        const msg = e?.response?.data?.message || e?.message || 'No se pudo conectar'
        setTestResult({ ok: false, message: msg })
      }
    } finally {
      setTesting(false)
    }
  }

  const isDirty = apiUrl !== config.apiUrl || apiToken !== config.apiToken

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Configuración</h1>
        <p className="text-muted-foreground">
          Configura la URL y el token M2M para conectarse al api-snowq-service
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Conexión al api-snowq-service</CardTitle>
          <CardDescription className="text-sm">
            Configura la URL y el token M2M para conectarse al servicio.
            Los valores se almacenan en localStorage del navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">URL del servicio</label>
            <Input
              placeholder="http://localhost:3090"
              value={apiUrl}
              onChange={e => setApiUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Ej: http://localhost:3090 o https://api-snowq.internal</p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Token M2M (Bearer)</label>
            <div className="relative">
              <Input
                type={showToken ? 'text' : 'password'}
                placeholder="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9..."
                value={apiToken}
                onChange={e => setApiToken(e.target.value)}
                className="pr-10 font-mono text-xs"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setShowToken(v => !v)}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Token M2M para autenticación con el backend.
              El token por defecto funciona para desarrollo local.
            </p>
          </div>

          {/* Test result */}
          {testResult && (
            <div className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md border ${
              testResult.ok
                ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300'
                : 'bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
            }`}>
              {testResult.ok
                ? <CheckCircle2 className="h-4 w-4 shrink-0" />
                : <XCircle className="h-4 w-4 shrink-0" />}
              {testResult.message}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button onClick={save} disabled={!isDirty && !saved}>
              {saved ? 'Guardado!' : 'Guardar'}
            </Button>
            <Button variant="outline" onClick={testConnection} disabled={testing}>
              {testing ? 'Probando...' : 'Probar conexión'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-base">Información</CardTitle>
          <CardDescription className="text-sm">Configuración actual almacenada en localStorage</CardDescription>
        </CardHeader>
        <CardContent className="text-sm space-y-2 text-muted-foreground">
          <p>URL del servicio: <span className="font-mono text-foreground">{config.apiUrl}</span></p>
          <p>Token: <span className="font-mono text-foreground">{config.apiToken ? config.apiToken.substring(0, 20) + '...' : '(no configurado)'}</span></p>
          <p className="text-xs mt-3">
            La configuración se almacena localmente en localStorage bajo las claves{' '}
            <code className="bg-muted px-1 py-0.5 rounded">snowq_api_url</code> y{' '}
            <code className="bg-muted px-1 py-0.5 rounded">snowq_api_token</code>.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
