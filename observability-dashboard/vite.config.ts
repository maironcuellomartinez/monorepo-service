import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'

export default defineConfig({
  // Fijo (no condicional): detrás de Apache en staging/prod se sirve bajo
  // /observability/ (sub-path del mismo dominio que el resto de los
  // dashboards). Condicionar esto por NODE_ENV es frágil — PM2 setea
  // NODE_ENV recién al arrancar `vite preview`, pero `npm run build` corre
  // ANTES de que PM2 inyecte esa variable, así que build y preview podrían
  // terminar con un `base` distinto y romper el ruteo de assets. Único
  // costo: `npm run dev` local queda en localhost:5174/observability/ en
  // vez de la raíz.
  base: '/observability/',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
