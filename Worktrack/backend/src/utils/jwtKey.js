// Khóa JWT dựng 1 lần: truyền chuỗi secret cho jsonwebtoken thì MỖI lần verify/sign nó lại thử
// createPublicKey() (thất bại, rất tốn CPU) rồi mới tạo khóa — chiếm ~35% CPU khi nhiều người dùng
const crypto = require('crypto');
require('dotenv').config();

module.exports = crypto.createSecretKey(Buffer.from(process.env.JWT_SECRET || '', 'utf8'));
