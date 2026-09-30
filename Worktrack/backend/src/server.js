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

// Khi chạy sau nginx (Docker): tin 1 lớp proxy để rate-limit thấy IP thật của
// người dùng thay vì IP của nginx. KHÔNG bật khi backend lộ trực tiếp ra mạng,
// vì khi đó ai cũng giả được header X-Forwarded-For để né giới hạn đăng nhập.
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

// ── Body parser ──
// File đi qua multer (upload riêng), JSON chỉ cần nhỏ — 100MB cũ cho phép
// làm treo server bằng vài request khổng lồ
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ── Rate limit chung cho API ──
// (Đã bỏ giới hạn riêng 10 lần đăng nhập/15 phút theo yêu cầu — đăng nhập giờ
// chỉ chịu giới hạn chung 200 request/phút/IP bên dưới.)
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 phút
  max: 600,                  // 600 request/phút/IP — trang Board 1 lần tải đã ~5 + số nhóm request
  message: { success: false, message: 'Quá nhiều request. Thử lại sau.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/uploads'), // skip static files
});

app.use('/api', apiLimiter);

// ── Static uploads — thử cả 2 đường dẫn ──
// File Excel báo cáo điểm (worktrack_period_*.xlsx) có tên đoán được → chặn
// tải trực tiếp, chỉ tải qua /api/dashboard/excel/ (đã kiểm tra quyền admin/manager).
app.use('/uploads', (req, res, next) =>
  /^worktrack_period_/i.test(path.basename(req.path)) ? res.status(404).end() : next());
// Ảnh/PDF được xem trực tiếp; mọi loại khác buộc tải về (không cho trình duyệt
// mở/chạy nội dung file người dùng tải lên ngay trên domain của hệ thống)
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

// ── Socket.IO ──
// Bọc app Express trong 1 http.Server, rồi attach Socket.IO vào server đó
// (không phải attach vào app) — đây là phần trước giờ CHƯA từng tồn tại.
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

// Xác thực socket bằng access token. Trước đây server tin `userId` do client
// tự khai → ai cũng nghe lén được thông báo realtime của người khác chỉ bằng
// cách đổi userId.
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
  console.log(`🔌 socket ${socket.id} joined room user:${userId}`);

  socket.on('disconnect', () => {
    console.log(`🔌 socket ${socket.id} disconnected`);
  });
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
// ⚠️ Đổi app.listen(...) thành server.listen(...) — phải listen trên http.Server
// đã attach Socket.IO, listen thẳng trên `app` như cũ sẽ làm Socket.IO không hoạt động.
// Không chỉ định host → nghe cả IPv4 lẫn IPv6. Chỉ nghe '0.0.0.0' (IPv4) thì
// trình duyệt/công cụ gọi "localhost" trên Windows thử IPv6 trước, bị từ chối
// rồi mới quay về IPv4 → mỗi kết nối mới chậm thêm ~200ms.
// backlog: hàng đợi kết nối chờ được nhận — mặc định 511; khi hàng trăm người
// cùng mở app 1 lúc (mỗi trình duyệt mở tới 6 kết nối) sẽ tràn → bị từ chối kết nối.
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

// ── Chống sập ──
// 1 lỗi async không được catch ở bất kỳ đâu (Node 15+) sẽ làm TẮT CẢ server →
// mọi người mất kết nối. Ghi log và chạy tiếp thay vì sập.
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason?.stack || reason);
});
// Lỗi đồng bộ không bắt được thì trạng thái process không còn tin cậy → ghi
// log rồi thoát để Docker/pm2 tự khởi động lại sạch sẽ.
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err.stack || err);
  process.exit(1);
});

// ── Graceful shutdown ──
// Đóng Socket.IO và http.Server đúng cách khi nodemon restart / process bị kill.
// Thiếu đoạn này là nguyên nhân phổ biến gây lỗi EADDRINUSE khi nodemon reload:
// process cũ không kịp release port trước khi process mới listen lại.
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