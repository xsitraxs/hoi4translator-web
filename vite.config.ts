import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api/proxy/google': {
        target: 'https://translate.googleapis.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy\/google/, ''),
      },
      '/api/proxy/mymemory': {
        target: 'https://api.mymemory.translated.net',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy\/mymemory/, ''),
      },
      '/api/proxy/deepl': {
        target: 'https://api-free.deepl.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/proxy\/deepl/, ''),
      },
    },
  },
});
