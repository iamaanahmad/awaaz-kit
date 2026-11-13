/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SPEECH_PROVIDER?: string;
  readonly VITE_APPWRITE_ENDPOINT?: string;
  readonly VITE_APPWRITE_PROJECT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
