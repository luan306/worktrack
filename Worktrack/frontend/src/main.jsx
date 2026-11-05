import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { i18nReady } from './i18n'
import useAuth from './store/authStore'
import './index.css'

// Chạy SONG SONG ngay khi tải trang: kiểm tra đăng nhập (/auth/me) + tải ngôn ngữ + tải file trang đang mở (App.jsx)
useAuth.getState().fetchMe();

const render = () => ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode><App /></React.StrictMode>
);
// Đợi ngôn ngữ tải xong (vài ms, đã cache) để không nháy chữ tiếng Anh; lỗi mạng vẫn vẽ bằng tiếng Anh
i18nReady.then(render, render);
