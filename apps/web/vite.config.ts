import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  server: {
    port: 5173,
    // 开发时把接口和 WebSocket 转发到后端，保持同源
    proxy: {
      '/api': 'http://localhost:3000',
      '/socket.io': { target: 'ws://localhost:3000', ws: true },
    },
  },
});
