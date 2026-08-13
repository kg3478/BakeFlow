// ============================================================
// BakeFlow ERP — Express Server Entry Point
// ============================================================
require('dotenv').config();

// ── Startup Environment Validation ───────────────────────────
const REQUIRED_VARS = ['DATABASE_URL', 'JWT_SECRET', 'GOOGLE_CLIENT_ID', 'ADMIN_PASSWORD', 'PLATFORM_ADMIN_EMAIL'];
const missing = REQUIRED_VARS.filter(v => !process.env[v]);
if (missing.length > 0) {
  console.warn('\n⚠️  WARNING: Missing environment variables:', missing.join(', '));
  console.warn('   Copy backend/.env.example to backend/.env and fill in all values.\n');
}

// Warn if default insecure values are used in production
if (process.env.NODE_ENV === 'production') {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('❌  FATAL: JWT_SECRET must be at least 32 characters in production.');
    process.exit(1);
  }
  if (process.env.ADMIN_PASSWORD === 'admin123' || process.env.ADMIN_PASSWORD === 'change-me-in-production') {
    console.error('❌  FATAL: ADMIN_PASSWORD is set to a default/insecure value. Change it before deploying.');
    process.exit(1);
  }
}

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const db      = require('./sheets/sheetsClient');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security: CORS ────────────────────────────────────────────
// In production, restrict origins. In development, allow all.
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim())
  : true; // Allow all in development

app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Employee-Name', 'X-Employee-Email', 'X-Google-Token'],
  credentials: true
}));

// ── Security: HTTP Headers ────────────────────────────────────
// Set basic security headers without requiring helmet package
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(self), microphone=()');
  next();
});

// ── Security: Rate Limiting (in-memory, no external package needed) ────────
// Simple sliding window rate limiter for auth endpoints
const rateLimitStore = new Map();
function rateLimit(maxRequests, windowMs) {
  return (req, res, next) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - windowMs;

    if (!rateLimitStore.has(key)) rateLimitStore.set(key, []);
    const requests = rateLimitStore.get(key).filter(t => t > windowStart);
    requests.push(now);
    rateLimitStore.set(key, requests);

    if (requests.length > maxRequests) {
      return res.status(429).json({
        success: false,
        error: `Too many requests. Please wait before trying again.`
      });
    }
    next();
  };
}

// Cleanup rate limit store every 5 minutes to avoid memory leak
setInterval(() => {
  const cutoff = Date.now() - 15 * 60 * 1000;
  for (const [key, times] of rateLimitStore.entries()) {
    const fresh = times.filter(t => t > cutoff);
    if (fresh.length === 0) rateLimitStore.delete(key);
    else rateLimitStore.set(key, fresh);
  }
}, 5 * 60 * 1000);

// ── Middleware ────────────────────────────────────────────────
app.use(express.json({ limit: '20mb' })); // 20mb for base64 image uploads
app.use(express.static(path.join(__dirname, '../frontend')));

// ── Public / Auth Routes (rate-limited) ──────────────────────
// 20 login attempts per 15 minutes per IP — prevents brute force
app.use('/api/auth', rateLimit(20, 15 * 60 * 1000), require('./routes/auth'));

// ── Health Check ─────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  const status = { status: 'ok', time: new Date().toISOString(), db: 'unknown' };
  try {
    await db.prisma.$queryRaw`SELECT 1`;
    status.db = 'connected';
    res.json(status);
  } catch (err) {
    status.status = 'degraded';
    status.db = 'disconnected';
    status.error = err.message;
    res.status(503).json(status);
  }
});

// ── Apply JWT auth globally to all secure /api endpoints ─────
const requireAuth      = require('./middleware/auth');
const { tenantMiddleware } = require('./middleware/tenantContext');
app.use('/api', requireAuth, tenantMiddleware);

// ── Secure API Routes ─────────────────────────────────────────
app.use('/api/ingredients', require('./routes/ingredients'));
app.use('/api/packaging',   require('./routes/packaging'));
app.use('/api/products',    require('./routes/products'));
app.use('/api/orders',      require('./routes/orders'));
app.use('/api/settings',    require('./routes/settings'));
app.use('/api/audit',       require('./routes/audit'));
app.use('/api/customers',   require('./routes/customers'));
app.use('/api/sales',       require('./routes/sales'));
app.use('/api/invoice',     require('./routes/invoice'));
app.use('/api/admin',       require('./routes/admin'));
app.use('/api/team',        require('./routes/team'));
app.use('/api/api-keys',    require('./routes/apiKeys'));
app.use('/api/export',      require('./routes/export'));

// ── Public REST API (API-key authenticated, no JWT required) ──
app.use('/v1', require('./routes/publicApi'));

// ── Admin SPA ─────────────────────────────────────────────────
app.get('/admin',   (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin/index.html')));
app.get('/admin/*', (req, res) => res.sendFile(path.join(__dirname, '../frontend/admin/index.html')));

// ── Team Access page ──────────────────────────────────────────
app.get('/team', (req, res) => res.sendFile(path.join(__dirname, '../frontend/team.html')));

// ── Self-serve signup ─────────────────────────────────────────
app.get('/signup', (req, res) => res.sendFile(path.join(__dirname, '../frontend/signup.html')));

// ── 404 handler for unknown /api routes ──────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, error: `API route not found: ${req.method} ${req.path}` });
});

// ── SPA fallback — serve index.html for all frontend routes ──
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend', 'index.html'));
});

// ── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Unhandled Error]', err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ── Bootstrap ─────────────────────────────────────────────────
async function start() {
  console.log('\n🎂  BakeFlow ERP — Starting...');
  console.log(`🌍  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log('🔌  Connecting to PostgreSQL (Neon)...');

  try {
    await db.init();
    console.log('✅  PostgreSQL connected & schema ready!\n');
    app.listen(PORT, () => {
      console.log(`🚀  Server running → http://localhost:${PORT}`);
      console.log(`🏥  Health check  → http://localhost:${PORT}/api/health`);
      console.log(`📊  BakeFlow ERP is ready!\n`);
    });
  } catch (err) {
    console.error('\n❌  Failed to start server:');
    console.error('   ', err.message);
    if (err.message.includes('DATABASE_URL')) {
      console.error('\n💡  Fix: Set DATABASE_URL in backend/.env — get your connection string from https://console.neon.tech\n');
    } else {
      console.error('\n💡  Check your backend/.env file — make sure DATABASE_URL and all required vars are set correctly.\n');
    }
    process.exit(1);
  }
}

start();
