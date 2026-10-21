import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the API is proxied same-origin, exactly like the Vercel rewrite in production,
// so cookies and auth behave identically in both.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // While the API restarts, answer 503 like a waking Render instance so the client's retry logic kicks in.
        configure: (proxy) =>
          proxy.on('error', (_err, _req, res) => {
            if ('writeHead' in res && !res.headersSent) res.writeHead(503, { 'Content-Type': 'text/plain' }).end('API starting');
          }),
      },
    },
  },
  build: { sourcemap: true },
});
