require('dotenv').config();
const express      = require('express');
const http         = require('http');
const { Server }   = require('socket.io');
const cors         = require('cors');
const path         = require('path');
const compression  = require('compression');
const helmet       = require('helmet');
const rateLimit    = require('express-rate-limit');

const app = express();

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
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// ── Rate limit: chống brute force ──
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 10,                   // tối đa 10 lần login/15 phút
  message: { success: false, message: 'Quá nhiều lần đăng nhập. Thử lại sau 15 phút.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 phút
  max: 200,                  // 200 request/phút
  message: { success: false, message: 'Quá nhiều request. Thử lại sau.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path.startsWith('/uploads'), // skip static files
});

app.use('/api/auth/login', loginLimiter);
app.use('/api', apiLimiter);

// ── Static uploads — thử cả 2 đường dẫn ──
const uploadPaths = [
  path.join(__dirname, 'uploads'),
  path.join(__dirname, '../uploads'),
];
uploadPaths.forEach(p => {
  const fs = require('fs');
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
  app.use('/uploads', express.static(p, { maxAge: '1d' }));
});

// ── Serve React frontend ──
const frontendDist = path.join(__dirname, '../../frontend/dist');
const fs = require('fs');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist, { maxAge: '1h' }));
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
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Server error' });
});

// ── Socket.IO ──
// Bọc app Express trong 1 http.Server, rồi attach Socket.IO vào server đó
// (không phải attach vào app) — đây là phần trước giờ CHƯA từng tồn tại.
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
});

io.on('connection', (socket) => {
  // Frontend (lib/socket.js) connect kèm `auth: { userId }`
  const userId = socket.handshake.auth?.userId;
  if (userId) {
    socket.join(`user:${userId}`);
    console.log(`🔌 socket ${socket.id} joined room user:${userId}`);
  }

  socket.on('disconnect', () => {
    console.log(`🔌 socket ${socket.id} disconnected`);
  });
});

// Cho các route/controller lấy io qua req.app.get('io')
app.set('io', io);

const PORT = process.env.PORT || 3001;
// ⚠️ Đổi app.listen(...) thành server.listen(...) — phải listen trên http.Server
// đã attach Socket.IO, listen thẳng trên `app` như cũ sẽ làm Socket.IO không hoạt động.
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 WorkTrack API → http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO đã sẵn sàng`);
});