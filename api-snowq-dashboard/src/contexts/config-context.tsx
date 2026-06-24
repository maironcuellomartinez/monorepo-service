import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface SnowQConfig {
  apiUrl: string
  apiToken: string
}

interface ConfigContextType {
  config: SnowQConfig
  isConfigured: boolean
  saveConfig: (config: SnowQConfig) => void
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined)

const DEFAULT_TOKEN = 'eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCIsImtpZCI6ImFiYWMtbTJtLXYxIn0.eyJzdWIiOiI4ZDQ3ZTVmYy0wZGMyLTRkZTctOTI5ZC1mMmFkYmRiNTUyMDkiLCJ0eXBlIjoic2VydmljZSIsImFwcGxpY2F0aW9uSWQiOiI4ZDQ3ZTVmYy0wZGMyLTRkZTctOTI5ZC1mMmFkYmRiNTUyMDkiLCJhcHBsaWNhdGlvbk5hbWUiOiJhcGktc25vd3Etc2VydmljZSIsImFjY291bnRUeXBlIjoic2VydmljZSIsImlzcyI6ImFiYWMtc2VydmljZSIsImF1ZCI6ImFiYWMtY2xpZW50cyIsImlhdCI6MTc3NjY0MTcxNiwiZXhwIjoxODA4MTc3NzE2fQ.mb89RlZejggG2kHCNEgKPzE92wSFukwZ99zKngpTP8BHM9RKJEdxgw63TyZ0XzmzJIyHcGduwPFrFMANO_ulAw'

const DEFAULTS: SnowQConfig = {
  apiUrl: (import.meta.env.VITE_API_BASE_URL as string) || '/api',
  apiToken: (import.meta.env.VITE_API_TOKEN as string) || DEFAULT_TOKEN,
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SnowQConfig>(() => {
    const apiUrl = localStorage.getItem('snowq_api_url') || DEFAULTS.apiUrl
    const apiToken = localStorage.getItem('snowq_api_token') || DEFAULTS.apiToken
    // Persistir defaults en localStorage para que api-client los lea en la primera carga
    if (!localStorage.getItem('snowq_api_url')) localStorage.setItem('snowq_api_url', apiUrl)
    if (!localStorage.getItem('snowq_api_token')) localStorage.setItem('snowq_api_token', apiToken)
    return { apiUrl, apiToken }
  })

  const saveConfig = useCallback((next: SnowQConfig) => {
    localStorage.setItem('snowq_api_url', next.apiUrl)
    localStorage.setItem('snowq_api_token', next.apiToken)
    setConfig(next)
  }, [])

  return (
    <ConfigContext.Provider
      value={{
        config,
        isConfigured: !!config.apiUrl,
        saveConfig,
      }}
    >
      {children}
    </ConfigContext.Provider>
  )
}

export function useConfig() {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig must be used within ConfigProvider')
  return ctx
}
