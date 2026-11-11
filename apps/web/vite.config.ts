// Vite: React + Tailwind 4. In development /api is proxied to the Node server (port 3000) with the
// browser's Host header kept, so the server resolves the tenant from localhost.
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  define: {
    // The /dev pages (tools, SMS inbox, component gallery) exist in development and staging builds only.
    __PROTOTYPE__: JSON.stringify(mode !== 'production'),
  },
  server: {
    port: 5173,
    strictPort: true,
    host: '127.0.0.1',
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false, xfwd: true } },
  },
  preview: { port: 4173, strictPort: true },
  build: {
    target: 'es2022',
    sourcemap: true,
    // Never inline fonts as data: URIs; the Content-Security-Policy allows fonts from 'self' only.
    assetsInlineLimit: (file: string) => (/\.(woff2?|ttf|otf)$/.test(file) ? false : undefined),
  },
}));
