import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind ra 0.0.0.0 để các máy khác trong mạng LAN (điện thoại, laptop khác) truy cập được
    // qua IP LAN của máy, không chỉ localhost
    host: true,
    port: 5173,
  },
})