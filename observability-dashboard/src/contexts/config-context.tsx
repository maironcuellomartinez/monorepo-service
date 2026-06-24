import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface ObsConfig {
  obsUrl: string
  obsToken: string
}

interface ConfigContextType {
  config: ObsConfig
  isConfigured: boolean
  saveConfig: (config: ObsConfig) => void
}

const ConfigContext = createContext<ConfigContextType | undefined>(undefined)

const DEFAULTS: ObsConfig = {
  obsUrl: import.meta.env.VITE_OBS_URL || 'http://localhost:3099',
  obsToken: import.meta.env.VITE_OBS_TOKEN || '',
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<ObsConfig>(() => ({
    obsUrl: localStorage.getItem('obs_url') || DEFAULTS.obsUrl,
    obsToken: localStorage.getItem('obs_token') || DEFAULTS.obsToken,
  }))

  const saveConfig = useCallback((next: ObsConfig) => {
    localStorage.setItem('obs_url', next.obsUrl)
    localStorage.setItem('obs_token', next.obsToken)
    setConfig(next)
  }, [])

  return (
    <ConfigContext.Provider
      value={{
        config,
        isConfigured: !!config.obsUrl,
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
