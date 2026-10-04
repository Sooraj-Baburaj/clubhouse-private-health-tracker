import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'], maximumFileSizeToCacheInBytes: 3 * 1024 * 1024 },
      // On in dev too: Chrome/Edge only offer "Install" when the manifest and a service worker are served, and push
      // notifications need the worker. Dev precaches nothing, so Vite's live reload is unaffected.
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        id: '/',
        name: 'Clubhouse',
        short_name: 'Clubhouse',
        description: 'Log food and moves with your crew.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f7f7f1',
        theme_color: '#f7f7f1',
        categories: ['health', 'fitness', 'lifestyle'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        share_target: {
          action: '/share-target',
          method: 'POST',
          enctype: 'multipart/form-data',
          params: { title: 'title', text: 'text', files: [{ name: 'photo', accept: ['image/*'] }] },
        },
        shortcuts: [
          { name: 'Snap a meal', url: '/log/food?view=snap', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
          { name: 'Log activity', url: '/log/activity', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true,
    // /admin is the admin app's dev server (base /admin/), so links into it work on this origin like they do on
    // Vercel, where both apps share one domain. ws: its HMR socket comes through here too.
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false }, '/admin': { target: 'http://localhost:5174', ws: true } },
  },
  preview: { port: 4173, proxy: { '/api': { target: 'http://localhost:3000' }, '/admin': { target: 'http://localhost:4174' } } },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 600 },
});
