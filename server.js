try { require('dotenv').config(); } catch (_) { /* dotenv not installed — env vars injected by platform */ }
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

// ===== ENSURE DIRECTORIES =====
['data', 'uploads'].forEach(dir => {
  const p = path.join(__dirname, dir);
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
});

// ===== SECURITY =====
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: IS_PROD ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
}));

// Rate limiters
const authLimiter   = rateLimit({ windowMs: 15*60*1000, max: IS_PROD ? 20 : 200, message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' }, standardHeaders: true, legacyHeaders: false });
const forgotLimiter = rateLimit({ windowMs: 60*60*1000, max: IS_PROD ? 5 : 50, message: { error: 'Trop de demandes. Réessayez dans 1 heure.' } });
const apiLimiter    = rateLimit({ windowMs: 60*1000, max: IS_PROD ? 120 : 1000, message: { error: 'Limite atteinte. Réessayez dans 1 minute.' }, standardHeaders: true, legacyHeaders: false });

// CORS
const allowedOrigins = IS_PROD
  ? [process.env.BASE_URL, `https://${process.env.RAILWAY_STATIC_URL}`].filter(Boolean)
  : ['http://localhost:3000', 'http://127.0.0.1:3000'];

app.use(cors({
  origin: IS_PROD ? allowedOrigins : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body & cookies
app.use(cookieParser(process.env.COOKIE_SECRET || crypto.randomBytes(32).toString('hex')));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(morgan(IS_PROD ? 'combined' : 'dev'));

// ===== ROUTES =====
const authRoutes       = require('./routes/auth');
const apiRoutes        = require('./routes/api');
const formationsRoutes = require('./routes/formations');
const learnersRoutes   = require('./routes/learners');
const bpfRoutes        = require('./routes/bpf');

// Auth (rate limited)
app.use('/api/auth/login',          authLimiter);
app.use('/api/auth/register',       authLimiter);
app.use('/api/auth/forgot-password', forgotLimiter);
app.use('/api/auth', authRoutes);

// Protected API (general rate limit)
app.use('/api/formations', apiLimiter, formationsRoutes);
app.use('/api/learners',   apiLimiter, learnersRoutes);
app.use('/api/bpf',        apiLimiter, bpfRoutes);
app.use('/api',            apiLimiter, apiRoutes);

// ===== STATIC FILES =====
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: IS_PROD ? '1d' : 0,
  etag: true,
  index: 'index.html',
}));

// ===== HEALTH CHECK =====
app.get('/health', (req, res) => {
  const { db } = require('./db');
  const users = db.get('users').value().length;
  res.json({
    status: 'ok',
    version: '1.0.0-beta',
    env: process.env.NODE_ENV || 'development',
    uptime: Math.round(process.uptime()),
    users_count: users,
    timestamp: new Date().toISOString(),
  });
});

// ===== SPA FALLBACK =====
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Route API introuvable' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== GLOBAL ERROR HANDLER =====
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (IS_PROD) {
    res.status(err.status || 500).json({ error: 'Erreur interne du serveur' });
  } else {
    res.status(err.status || 500).json({ error: err.message, stack: err.stack });
  }
});

// ===== GRACEFUL SHUTDOWN =====
process.on('SIGTERM', () => { console.log('SIGTERM — Arrêt gracieux...'); process.exit(0); });
process.on('SIGINT',  () => { console.log('SIGINT — Arrêt gracieux...');  process.exit(0); });

// ===== START =====
app.listen(PORT, () => {
  const line = '═'.repeat(42);
  console.log(`\n╔${line}╗`);
  console.log(`║       FormaPro Beta v1.0 — Démarré !       ║`);
  console.log(`╠${line}╣`);
  console.log(`║  🚀  http://localhost:${PORT}${' '.repeat(19 - String(PORT).length)}║`);
  console.log(`║  🌍  Env    : ${(process.env.NODE_ENV||'development').padEnd(28)}║`);
  console.log(`╠${line}╣`);
  console.log(`║  Routes disponibles :                       ║`);
  console.log(`║  POST /api/auth/login                       ║`);
  console.log(`║  POST /api/auth/register                    ║`);
  console.log(`║  POST /api/auth/forgot-password             ║`);
  console.log(`║  GET  /api/dashboard                        ║`);
  console.log(`║  GET  /api/invoices  /api/clients           ║`);
  console.log(`║  GET  /api/sessions  /api/qualiopi          ║`);
  console.log(`║  GET  /api/formations /api/learners         ║`);
  console.log(`║  GET  /api/bpf  /api/settings               ║`);
  console.log(`║  GET  /health                               ║`);
  console.log(`╚${line}╝\n`);
});

module.exports = app;
