/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORAGE_MODE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
