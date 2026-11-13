import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { orderPwa } from './pwa.config';
import { packageManifestDefine } from '../../tools/packageManifest';

// Served under /order/ (the Bill app is served under /bill/ on the same origin).
export default defineConfig({
  base: '/order/',
  define: packageManifestDefine(),
  plugins: [react(), tailwindcss(), orderPwa()],
  server: { port: 5173 },
});
