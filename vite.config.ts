import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    // A fixed IPv4 listener keeps bookmarked 127.0.0.1 URLs and Vite's HMR
    // socket on the same endpoint after a restart. strictPort prevents Vite
    // from silently moving to 5174 while an older browser tab stays on 5173.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
  },
})
