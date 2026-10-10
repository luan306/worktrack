# frontend/Dockerfile
# Server là mạng NỘI BỘ, không ra internet được → KHÔNG build ("npm install" + "vite build") trên server.
# Bản build nằm sẵn trong source: chạy "npm run build" trên máy dev rồi commit thư mục frontend/dist.
# Image này chỉ là Nginx phục vụ thư mục đó + chuyển /api, /socket.io, /uploads sang backend.
FROM nginx:alpine

COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
