/// <reference types="vite/client" />

// This file teaches TypeScript about import.meta.env, which Vite provides at
// build time. Without it, reading VITE_API_URL in api.ts is a type error.

interface ImportMetaEnv {
  // Where the Go API lives. Set it when starting Vite to point the dashboard
  // at an API on another machine:
  //
  //   VITE_API_URL=http://10.0.0.5:8080 npm run dev
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
