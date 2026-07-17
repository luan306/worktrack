# backend/Dockerfile
FROM node:20-alpine

WORKDIR /app

# Cài dependencies trước (tận dụng cache layer — chỉ rebuild lại bước này khi
# package.json thay đổi, không phải mỗi lần sửa code)
COPY package*.json ./
RUN npm install --omit=dev

# Copy toàn bộ source backend
COPY . .

# Thư mục chứa file đính kèm/Excel export — sẽ được mount ra ngoài qua volume
# trong docker-compose.yml để không mất dữ liệu khi container bị xóa/rebuild
RUN mkdir -p uploads

EXPOSE 3001

CMD ["node", "server.js"]
