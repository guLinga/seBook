/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORAGE_MODE?: 'static' | 'local' | string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
