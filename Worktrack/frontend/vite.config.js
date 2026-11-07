import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Thư viện nền tách ra file riêng: chúng gần như không đổi giữa các lần cập nhật web → tên file (mã băm)
// giữ nguyên → trình duyệt dùng lại bản đã lưu (nginx cache 1 năm). Mỗi lần cập nhật mọi người chỉ phải
// tải lại phần code app (~vài chục KB) thay vì cả ~320KB như trước.
const VENDOR = [
  ['vendor-react', /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|zustand|use-sync-external-store)[\\/]/],
  ['vendor-net', /[\\/]node_modules[\\/](axios|socket\.io-client|socket\.io-parser|engine\.io-client|engine\.io-parser|@socket\.io|i18next|react-i18next|html-parse-stringify|void-elements)[\\/]/],
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind ra 0.0.0.0 để các máy khác trong mạng LAN (điện thoại, laptop khác) truy cập được
    // qua IP LAN của máy, không chỉ localhost
    host: true,
    port: 5173,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          for (const [name, re] of VENDOR) if (re.test(id)) return name
        },
      },
    },
  },
})
