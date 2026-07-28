import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  // Fijo (no condicional): detrás de Apache en staging/prod se sirve bajo
  // /snowq/ (sub-path del mismo dominio que el resto de los dashboards).
  // Condicionar esto por NODE_ENV es frágil — PM2 setea NODE_ENV recién al
  // arrancar `vite preview`, pero `npm run build` corre ANTES de que PM2
  // inyecte esa variable, así que build y preview podrían terminar con un
  // `base` distinto y romper el ruteo de assets. Único costo: `npm run dev`
  // local queda en localhost:3091/snowq/ en vez de la raíz.
  base: '/snowq/',
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3091,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3090',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            console.log('[Proxy Error]', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, res) => {
            console.log('[Proxy] Sending:', req.method, req.url, '->', proxyReq.path);
          });
          proxy.on('proxyRes', (proxyRes, req, res) => {
            console.log('[Proxy] Received:', proxyRes.statusCode, req.url);
          });
        },
      },
    },
  },
})
