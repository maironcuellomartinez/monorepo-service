import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Header } from '../components/header'
import { alertsApi } from '../lib/api'
import { formatDate } from '../lib/utils'
import type { AlertRule, ActiveAlert, AlertSeverity, LogLevel } from '../types'
import { Bell, Plus, Trash2, AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'

const SEVERITY_BADGE: Record<AlertSeverity, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  warning:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  info:     'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
}

const LOG_LEVELS: LogLevel[] = ['error', 'warn', 'info', 'http', 'verbose', 'debug']

const DEFAULT_RULE = {
  name: '',
  service: '',
  level: 'error' as LogLevel,
  threshold: 10,
  windowMinutes: 5,
  severity: 'warning' as AlertSeverity,
  enabled: true,
}

export function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [activeAlerts, setActiveAlerts] = useState<ActiveAlert[]>([])
  const [evaluating, setEvaluating] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(DEFAULT_RULE)

  const loadRules = useCallback(() => {
    setRules(alertsApi.getRules())
  }, [])

  useEffect(() => { loadRules() }, [loadRules])

  const evaluate = async () => {
    setEvaluating(true)
    try {
      const alerts = await alertsApi.evaluate(rules)
      setActiveAlerts(alerts)
    } finally {
      setEvaluating(false)
    }
  }

  const addRule = () => {
    if (!form.name.trim()) return
    alertsApi.addRule({
      name: form.name,
      ...(form.service ? { service: form.service } : {}),
      level: form.level,
      threshold: form.threshold,
      windowMinutes: form.windowMinutes,
      severity: form.severity,
      enabled: true,
    })
    setForm(DEFAULT_RULE)
    setShowForm(false)
    loadRules()
  }

  const deleteRule = (id: string) => {
    alertsApi.deleteRule(id)
    loadRules()
  }

  const toggleRule = (id: string) => {
    alertsApi.toggleRule(id)
    loadRules()
  }

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Alertas"
        onRefresh={evaluate}
        refreshing={evaluating}
      />
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {/* Active alerts */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Alertas activas
              </CardTitle>
              <Button variant="outline" size="sm" onClick={evaluate} disabled={evaluating}>
                <RefreshCw className={`h-4 w-4 mr-2 ${evaluating ? 'animate-spin' : ''}`} />
                Evaluar ahora
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {activeAlerts.length === 0 ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                {evaluating ? 'Evaluando reglas...' : 'Sin alertas activas. Haz clic en "Evaluar ahora" para verificar.'}
              </div>
            ) : (
              <div className="space-y-2">
                {activeAlerts.map(alert => (
                  <div key={alert.ruleId} className="flex items-start gap-3 p-3 rounded-md border border-border bg-muted/20">
                    <AlertTriangle className={`h-5 w-5 mt-0.5 shrink-0 ${
                      alert.severity === 'critical' ? 'text-red-500' :
                      alert.severity === 'warning'  ? 'text-yellow-500' : 'text-blue-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{alert.ruleName}</span>
                        <Badge className={`text-xs ${SEVERITY_BADGE[alert.severity]}`}>{alert.severity}</Badge>
                        {alert.service && <span className="text-xs text-muted-foreground">{alert.service}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {alert.count} eventos · detectado {formatDate(alert.detectedAt)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rules */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Reglas configuradas ({rules.length})</CardTitle>
              <Button size="sm" onClick={() => setShowForm(v => !v)}>
                <Plus className="h-4 w-4 mr-1" />
                Nueva regla
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Add form */}
            {showForm && (
              <div className="border border-border rounded-md p-4 space-y-3 bg-muted/20">
                <h4 className="text-sm font-medium">Nueva regla de alerta</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Input
                    placeholder="Nombre *"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  />
                  <Input
                    placeholder="Servicio (opcional)"
                    value={form.service}
                    onChange={e => setForm(f => ({ ...f, service: e.target.value }))}
                  />
                  <Select value={form.level} onValueChange={v => setForm(f => ({ ...f, level: v as LogLevel }))}>
                    <SelectTrigger><SelectValue placeholder="Nivel" /></SelectTrigger>
                    <SelectContent>
                      {LOG_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number"
                      placeholder="Umbral"
                      value={form.threshold}
                      onChange={e => setForm(f => ({ ...f, threshold: Number(e.target.value) }))}
                      className="w-full"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">eventos</span>
                  </div>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="number"
                      placeholder="Ventana"
                      value={form.windowMinutes}
                      onChange={e => setForm(f => ({ ...f, windowMinutes: Number(e.target.value) }))}
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">min</span>
                  </div>
                  <Select value={form.severity} onValueChange={v => setForm(f => ({ ...f, severity: v as AlertSeverity }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">info</SelectItem>
                      <SelectItem value="warning">warning</SelectItem>
                      <SelectItem value="critical">critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={addRule} disabled={!form.name.trim()}>Guardar</Button>
                  <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
                </div>
              </div>
            )}

            {/* Rules list */}
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">Sin reglas configuradas.</p>
            ) : (
              <div className="space-y-2">
                {rules.map(rule => (
                  <div
                    key={rule.id}
                    className={`flex items-center gap-3 p-3 rounded-md border ${
                      rule.enabled ? 'border-border' : 'border-border/40 opacity-60'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{rule.name}</span>
                        <Badge className={`text-xs ${SEVERITY_BADGE[rule.severity]}`}>{rule.severity}</Badge>
                        {rule.service && <span className="text-xs text-muted-foreground">{rule.service}</span>}
                        {rule.level && <Badge variant="outline" className="text-xs">{rule.level}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        ≥ {rule.threshold} eventos en {rule.windowMinutes} min · creada {formatDate(rule.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => toggleRule(rule.id)}
                      >
                        {rule.enabled ? 'Deshabilitar' : 'Habilitar'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => deleteRule(rule.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
