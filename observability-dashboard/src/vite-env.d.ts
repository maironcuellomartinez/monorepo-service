/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OBS_URL: string
  readonly VITE_OBS_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
