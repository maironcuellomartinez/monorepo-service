import axios from 'axios'
import type {
  LogsQuery,
  LogsResponse,
  TracesQuery,
  TracesResponse,
  TraceSpan,
  MetricsQuery,
  MetricsResponse,
  HealthStatus,
  AlertRule,
  ActiveAlert,
} from '../types'

function getConfig(): { url: string; token: string } {
  return {
    url: localStorage.getItem('obs_url') || import.meta.env.VITE_OBS_URL || 'http://localhost:3099',
    token: localStorage.getItem('obs_token') || import.meta.env.VITE_OBS_TOKEN || '',
  }
}

function buildClient() {
  const { url, token } = getConfig()
  return axios.create({
    baseURL: url,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    timeout: 10_000,
  })
}

// Always build a fresh client so URL/token changes are picked up immediately
const api = () => buildClient()

// ── Health ─────────────────────────────────────────────────────────────────────

export const healthApi = {
  get: () => api().get<HealthStatus>('/health'),
}

// ── Logs ───────────────────────────────────────────────────────────────────────

export const logsApi = {
  query: (params?: LogsQuery) => api().get<LogsResponse>('/query/logs', { params }),
  services: () => api().get<string[]>('/query/logs/services'),
}

// ── Traces ─────────────────────────────────────────────────────────────────────

export const tracesApi = {
  query: (params?: TracesQuery) => api().get<TracesResponse>('/query/traces', { params }),
  getTrace: (traceId: string) => api().get<TraceSpan[]>(`/query/traces/${traceId}`),
  services: () => api().get<string[]>('/query/traces/services'),
}

// ── Metrics ────────────────────────────────────────────────────────────────────

export const metricsApi = {
  query: (params?: MetricsQuery) => api().get<MetricsResponse>('/query/metrics', { params }),
  names: () => api().get<string[]>('/query/metrics/names'),
  services: () => api().get<string[]>('/query/metrics/services'),
}

// ── Alerts (frontend-only — stored in localStorage) ───────────────────────────

const ALERTS_KEY = 'obs_alert_rules'

export const alertsApi = {
  getRules: (): AlertRule[] => {
    try {
      return JSON.parse(localStorage.getItem(ALERTS_KEY) || '[]')
    } catch {
      return []
    }
  },
  saveRules: (rules: AlertRule[]) => {
    localStorage.setItem(ALERTS_KEY, JSON.stringify(rules))
  },
  addRule: (rule: Omit<AlertRule, 'id' | 'createdAt'>): AlertRule => {
    const rules = alertsApi.getRules()
    const newRule: AlertRule = {
      ...rule,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    alertsApi.saveRules([...rules, newRule])
    return newRule
  },
  deleteRule: (id: string) => {
    alertsApi.saveRules(alertsApi.getRules().filter(r => r.id !== id))
  },
  toggleRule: (id: string) => {
    alertsApi.saveRules(
      alertsApi.getRules().map(r => (r.id === id ? { ...r, enabled: !r.enabled } : r)),
    )
  },
  // Evaluate rules client-side against recent log counts
  evaluate: async (rules: AlertRule[]): Promise<ActiveAlert[]> => {
    const active: ActiveAlert[] = []
    const enabledRules = rules.filter(r => r.enabled)
    if (enabledRules.length === 0) return active

    for (const rule of enabledRules) {
      try {
        const from = new Date(Date.now() - rule.windowMinutes * 60_000).toISOString()
        const params: LogsQuery = { from, limit: 0, ...(rule.service ? { service: rule.service } : {}), ...(rule.level ? { level: rule.level } : {}) }
        const { data } = await api().get<LogsResponse>('/query/logs', { params })
        if (data.total >= rule.threshold) {
          active.push({
            ruleId: rule.id,
            ruleName: rule.name,
            severity: rule.severity,
            status: 'active',
            count: data.total,
            detectedAt: new Date().toISOString(),
            service: rule.service,
          })
        }
      } catch {
        // skip rule on error
      }
    }
    return active
  },
}
