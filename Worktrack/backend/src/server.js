require('dotenv').config();
const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const cors         = require('cors');
const path         = require('path');
const compression  = require('compression');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');

const { verifyAccessToken } = require('./middleware/auth');

const app = express();

// Khi chạy sau nginx (Docker): tin 1 lớp proxy để rate-limit thấy IP thật của người dùng thay vì IP của nginx
if (process.env.TRUST_PROXY) app.set('trust proxy', +process.env.TRUST_PROXY || process.env.TRUST_PROXY);

// ── Bảo mật HTTP headers ──
app.use(helmet({
  contentSecurityPolicy: false, // tắt CSP để không block frontend assets
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ──
app.use(cors({
  origin: '*',
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.options('*', cors());

// ── Gzip ──
app.use(compression());

// Body parser
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Rate limit chung cho API
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 phút
  max: 600,                  // 600 request/phút/IP — trang Board 1 lần tải đã ~5 + số nhóm request
  message: { success: false, message: 'Quá nhiều request. Thử lại sau.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/uploads'), // skip static files
});

app.use('/api', apiLimiter);

// Static uploads — thử cả 2 đường dẫn
app.use('/uploads', (req, res, next) =>
  /^worktrack_period_/i.test(path.basename(req.path)) ? res.status(404).end() : next());
// Ảnh/PDF được xem trực tiếp; mọi loại khác buộc tải về
const INLINE_OK = /\.(png|jpe?g|gif|webp|bmp|pdf)$/i;
const uploadPaths = [
  path.join(__dirname, 'uploads'),
  path.join(__dirname, '../uploads'),
];
uploadPaths.forEach(p => {
  const fs = require('fs');
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  app.use('/uploads', express.static(p, {
    maxAge: '1d',
    setHeaders: (res, filePath) => { if (!INLINE_OK.test(filePath)) res.setHeader('Content-Disposition', 'attachment'); },
  }));
});

// ── Serve React frontend ──
const frontendDist = path.join(__dirname, '../../frontend/dist');
const fs = require('fs');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { maxAge: '1h' }));
}

// ── Production: không trả chi tiết lỗi nội bộ (câu SQL, tên bảng...) cho client ──
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 500 && body && typeof body === 'object') {
        console.error('[500]', req.method, req.originalUrl, body.message || body.error);
        body = { success: false, message: 'Lỗi máy chủ, vui lòng thử lại' };
      }
      return json(body);
    };
    next();
  });
}

// ── Routes ──
app.use('/api', require('./routes/index'));

// ── SPA fallback ──
if (fs.existsSync(frontendDist)) {
  app.get(/^(?!\/api).*/, (_, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ── Health ──
app.get('/health', (_, res) => res.json({ ok: true, time: new Date() }));

// ── 404 ──
app.use((_, res) => res.status(404).json({ success: false, message: 'Not found' }));

// ── Error handler ──
app.use((err, _, res, __) => {
  // Lỗi do request sai (file quá lớn / bị chặn, JSON hỏng...) → 400 kèm lý do
  const status = err.status || err.statusCode || (err.name === 'MulterError' ? 400 : 500);
  if (status >= 500) console.error(err.stack);
  const message = err.code === 'LIMIT_FILE_SIZE' ? 'File vượt quá 20MB'
    : status < 500 ? err.message : 'Server error';
  res.status(status).json({ success: false, message });
});

// Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Xác thực socket bằng access token
io.use(async (socket, next) => {
  try {
    const user = await verifyAccessToken(socket.handshake.auth?.token);
    socket.data.userId = user.id;
    next();
  } catch (e) {
    next(new Error(e.status ? e.message : 'Server error'));
  }
});

io.on('connection', (socket) => {
  const { userId } = socket.data;
  socket.join(`user:${userId}`);
  // Không log từng lần kết nối / ngắt: hàng trăm người × mỗi lần mở tab, rớt mạng → log phình vô hạn
});

// Cho các route/controller lấy io qua req.app.get('io')
app.set('io', io);

// ── Lấy IP LAN để log ra cho tiện test từ điện thoại/Expo ──
function getLocalIp() {
  const os = require('os');
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      // Bỏ qua IPv6 và địa chỉ loopback (127.0.0.1)
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost'; // fallback nếu không tìm thấy interface nào
}

const PORT = process.env.PORT || 3001;
// ⚠️ Đổi app.listen(...) thành server.listen(...)
server.listen({ port: PORT, backlog: 4096 }, () => {
  const localIp = getLocalIp();
  console.log(`🚀 WorkTrack API → http://localhost:${PORT}`);
  console.log(`🌐 LAN            → http://${localIp}:${PORT}`);
  console.log(`🔌 Socket.IO đã sẵn sàng`);
});

// ── Tự động chốt kỳ + xuất Excel + reset điểm (00:00 ngày 01/04 và 01/10) ──
require('./cron/scoreAutoLock.cron');
// ── Bảo trì DB: index cần thiết + dọn token hết hạn / thông báo cũ ──
require('./config/indexes').ensureIndexes();
require('./cron/maintenance.cron');
// ── Nhắc chấm điểm (leader) + nhắc ghi việc (nhân viên) — 08:00 sáng T2–T6 ──
require('./cron/worklogReminder.cron')(io);

// Chống sập
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason?.stack || reason);
});
// Lỗi đồng bộ không bắt được thì trạng thái process không còn tin cậy
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.stack || err);
  process.exit(1);
});

// Graceful shutdown
function gracefulShutdown(signal) {
  console.log(`\n🛑 Nhận ${signal}, đang tắt server...`);
  io.close(() => {
    console.log('🔌 Socket.IO đã đóng');
  });
  server.close(() => {
    console.log('✅ HTTP server đã đóng, thoát process');
    process.exit(0);
  });

  // Nếu sau 5s vẫn chưa đóng xong thì force exit, tránh treo process
  setTimeout(() => {
    console.error('⚠️  Force exit do timeout khi đóng server');
    process.exit(1);
  }, 5000).unref();
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGUSR2', () => {
  // nodemon gửi SIGUSR2 trước khi restart process
  gracefulShutdown('SIGUSR2 (nodemon restart)');
});