import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the browser talks to Vite (port 5173) and Vite forwards /api to Express (port 5000).
// Same origin => the login cookie "just works" and no CORS setup is needed.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:5000' } },
});
