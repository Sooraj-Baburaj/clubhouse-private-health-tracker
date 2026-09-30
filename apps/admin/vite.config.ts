import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/admin/',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  plugins: [react(), tailwindcss()],
  server: { port: 5174, host: true, proxy: { '/api': { target: 'http://localhost:3000' } } },
  preview: { port: 4174, proxy: { '/api': { target: 'http://localhost:3000' } } },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 800 },
});
