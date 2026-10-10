# backend/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Server là mạng NỘI BỘ, không ra internet được → KHÔNG chạy "npm install" lúc build.
# Thư viện nằm sẵn trong source (backend/node_modules được commit vào git, toàn JavaScript
# thuần nên dùng được trên Linux). Thêm / nâng cấp thư viện: chạy "npm install" trên máy
# có mạng rồi commit thư mục node_modules.
COPY . .

# Thư mục chứa file đính kèm/Excel export. Code lưu file vào src/uploads (xem
# src/middleware/upload.js) → docker-compose.yml mount đúng thư mục NÀY ra ngoài
# để không mất file khi container bị xóa/rebuild
RUN mkdir -p src/uploads

EXPOSE 3001

# File khởi động nằm trong src/ (giống "npm start")
CMD ["node", "src/server.js"]
