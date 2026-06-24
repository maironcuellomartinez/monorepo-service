import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Header } from '../components/header'
import { useConfig } from '../contexts/config-context'
import { healthApi } from '../lib/api'
import { CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react'

export function SettingsPage() {
  const { config, saveConfig } = useConfig()
  const [obsUrl, setObsUrl] = useState(config.obsUrl)
  const [obsToken, setObsToken] = useState(config.obsToken)
  const [showToken, setShowToken] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)
  const [saved, setSaved] = useState(false)

  const save = () => {
    saveConfig({ obsUrl, obsToken })
    setSaved(true)
    setTestResult(null)
    setTimeout(() => setSaved(false), 2000)
  }

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const { data } = await healthApi.get()
      setTestResult({ ok: data.status === 'ok', message: `Estado: ${data.status} · DB: ${data.db} · uptime: ${Math.round(data.uptime / 60)}m` })
    } catch (e: any) {
      const msg = e?.response?.data?.message || e?.message || 'No se pudo conectar'
      setTestResult({ ok: false, message: msg })
    } finally {
      setTesting(false)
    }
  }

  const isDirty = obsUrl !== config.obsUrl || obsToken !== config.obsToken

  return (
    <div className="flex flex-col h-full">
      <Header title="Configuracion" />
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Conexion al Observability Service</CardTitle>
            <CardDescription className="text-sm">
              Configura la URL y el token M2M para conectarse al servicio de observabilidad.
              Los valores se almacenan en localStorage del navegador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">URL del servicio</label>
              <Input
                placeholder="http://localhost:3099"
                value={obsUrl}
                onChange={e => setObsUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Ej: http://localhost:3099 o https://obs.internal</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Token M2M (Bearer)</label>
              <div className="relative">
                <Input
                  type={showToken ? 'text' : 'password'}
                  placeholder="eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9..."
                  value={obsToken}
                  onChange={e => setObsToken(e.target.value)}
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
                Obtener via <code className="bg-muted px-1 py-0.5 rounded text-xs">POST /auth/m2m-token</code> en abac-microservice.
                Dejar vacío si el servicio tiene <code className="bg-muted px-1 py-0.5 rounded text-xs">@Public()</code> en los endpoints de query.
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
              <Button onClick={save} disabled={!isDirty}>
                {saved ? 'Guardado' : 'Guardar'}
              </Button>
              <Button variant="outline" onClick={testConnection} disabled={testing}>
                {testing ? 'Probando...' : 'Probar conexion'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informacion</CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2 text-muted-foreground">
            <p>URL actual: <span className="font-mono text-foreground">{config.obsUrl}</span></p>
            <p>Token: <span className="font-mono text-foreground">{config.obsToken ? '••••••••' : '(vacío)'}</span></p>
            <p className="text-xs mt-3">
              Las alertas se almacenan localmente en localStorage bajo la clave <code className="bg-muted px-1 py-0.5 rounded">obs_alert_rules</code>.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
