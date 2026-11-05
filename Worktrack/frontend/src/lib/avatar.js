// Ảnh đại diện: đường dẫn hiển thị + cắt vuông / thu nhỏ ngay trong trình duyệt trước khi tải lên
const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/api\/?$/, '');

// '/uploads/avatars/x.jpg' → đầy đủ (dev: backend chạy cổng khác; production: nginx cùng domain)
export const avatarSrc = (url) => (!url ? null : /^https?:/.test(url) ? url : API_BASE + url);

// Cắt giữa thành hình vuông, thu về size×size, nén JPEG → file vài chục KB
export function resizeAvatar(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png|webp|gif|bmp)$/i.test(file.type)) return reject(new Error('Chỉ nhận ảnh JPG, PNG, WEBP'));
    if (file.size > 15 * 1024 * 1024) return reject(new Error('Ảnh quá lớn (tối đa 15MB)'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(img.naturalWidth, img.naturalHeight);
      const canvas = Object.assign(document.createElement('canvas'), { width: size, height: size });
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size); // PNG trong suốt → nền trắng
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Không xử lý được ảnh'))), 'image/jpeg', 0.86);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Không đọc được ảnh')); };
    img.src = url;
  });
}
