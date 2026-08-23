import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Docker en Windows necesita polling para detectar cambios en bind mounts.
    watch: { usePolling: true, interval: 300 },
  },
});
