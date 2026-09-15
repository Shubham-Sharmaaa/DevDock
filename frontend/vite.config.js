import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forwards /api/* to the backend during local dev, including the
      // Set-Cookie header for the refresh token -- so the browser treats
      // requests as same-origin and CORS/cookie config stays simple.
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
});
