/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend origin (no path), e.g. http://localhost:3100 */
  readonly VITE_SERVER_URL?: string;
}
