require('dotenv').config();
const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const compression = require('compression');

const app = express();

// ── Gzip tất cả response ──
app.use(compression());

// ── CORS ──
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// ── Body parser ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Cache headers cho static files ──
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), {
  maxAge: '1d',
}));

// ── Routes ──
app.use('/api', require('./routes/index'));

// ── Health ──
app.get('/health', (_, res) => res.json({ status: 'ok', time: new Date() }));

// ── 404 ──
app.use((_, res) => res.status(404).json({ success: false, message: 'Not found' }));

// ── Error ──
app.use((err, _, res, __) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: 'Server error' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 WorkTrack API → http://localhost:${PORT}`);
});