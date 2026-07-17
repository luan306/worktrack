# frontend/Dockerfile
# ── Stage 1: build ──
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

# Vite đọc biến VITE_API_URL lúc BUILD (không phải lúc chạy), truyền vào qua
# --build-arg khi docker build, hoặc để mặc định trỏ về '/api' vì Nginx trong
# cùng container này sẽ tự proxy '/api' sang backend — không cần domain đầy đủ.
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ── Stage 2: serve bằng Nginx ──
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
