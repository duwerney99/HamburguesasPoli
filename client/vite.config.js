import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  root: path.resolve('client'),
  envDir: path.resolve('.'),
  plugins: [react(), tailwindcss()],
  build: { outDir: path.resolve('dist'), emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://localhost:3001' } }
});
