import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { orderPwa } from './pwa.config';
import { packageManifestDefine } from '../../tools/packageManifest';
import { SPEECH_BUILD_EXTERNALS } from '../../tools/speechRuntimeCache';

// Served under /order/ (the Bill app is served under /bill/ on the same origin).
export default defineConfig({
  base: '/order/',
  define: packageManifestDefine(),
  plugins: [react(), tailwindcss(), orderPwa()],
  server: { port: 5173 },
  build: { rollupOptions: { external: SPEECH_BUILD_EXTERNALS } },
  // The speech model runs in a module worker (it uses dynamic imports).
  worker: { format: 'es', rollupOptions: { external: SPEECH_BUILD_EXTERNALS } },
});
