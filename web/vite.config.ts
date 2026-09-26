import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const server = process.env.ROADIES_SERVER ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    // Tunnels (cloudflared / ngrok) use their own hostnames.
    allowedHosts: true,
    proxy: {
      '/ws': { target: server, ws: true },
      '/dev': server,
      '/healthz': server,
    },
  },
});
