/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** true: chamadas a /api e WebSocket /ws na mesma origem (obrigatório com site HTTPS). */
  readonly VITE_USE_SAME_ORIGIN_API?: string;
}
