/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Solo para servir la API desde otro dominio. Vacia = mismo origen. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
