const multer = require('multer');
const path   = require('path');
const fs     = require('fs');

const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Đuôi file chạy được trong trình duyệt / hệ điều hành — chặn để không ai tải
// lên trang HTML/SVG chứa mã độc rồi gửi link cho người khác mở (đánh cắp
// token đăng nhập), hoặc phát tán file thực thi qua hệ thống.
const BLOCKED_EXT = new Set([
  '.html', '.htm', '.xhtml', '.shtml', '.svg', '.svgz', '.xml', '.xsl', '.js', '.mjs', '.jsp', '.php',
  '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.ps1', '.vbs', '.vbe', '.wsf', '.hta', '.jar', '.sh', '.dll', '.lnk',
]);
const safeExt = (name) => path.extname(name).toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename:    (req, file, cb) => {
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt(file.originalname)}`;
    cb(null, name);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB — khớp client_max_body_size của nginx
  fileFilter: (req, file, cb) => {
    if (BLOCKED_EXT.has(safeExt(file.originalname))) {
      return cb(Object.assign(new Error('Loại file này không được phép tải lên'), { status: 400 }));
    }
    cb(null, true);
  },
});

module.exports = upload;