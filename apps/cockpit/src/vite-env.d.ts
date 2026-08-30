/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "1" serves frozen showcase data instead of a live engine (public Vercel deploy). */
  readonly VITE_SHOWCASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
