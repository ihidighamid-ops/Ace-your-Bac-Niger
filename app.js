'use strict';

const express   = require('express');
const session   = require('express-session');
const path      = require('path');
const fs        = require('fs');
const rateLimit = require('express-rate-limit');
const helmet    = require('helmet');
const compress  = require('compression');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Creer dossiers upload au demarrage ──
['public/uploads','public/recus','public/flamme'].forEach(function(d) {
  const dir = path.join(__dirname, d);
  try { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
  catch(e) { console.warn('[WARN] dossier non cree:', d, e.message); }
});

// ── Compression gzip ──
app.use(compress());

// ── Securite Helmet ──
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// ── Trust proxy Render ──
app.set('trust proxy', 1);

// ── Body parsers ──
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Fichiers statiques ──
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '1h',
  setHeaders(res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }
}));
app.use('/flamme-media', express.static(path.join(__dirname, 'public/flamme')));
app.use('/recus-media',  express.static(path.join(__dirname, 'public/recus')));

// ── Sessions ──
app.use(session({
  secret: process.env.SESSION_SECRET || 'bac-tools-niger-2026-dev-secret',
  resave: false,
  saveUninitialized: false,
  name: 'btn_sid',
  cookie: {
    secure:   process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge:   7 * 24 * 60 * 60 * 1000
  }
}));

// ── Rate limiters ──
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler(req, res) {
    res.status(429).send(page429());
  }
});

app.use('/connexion', loginLimiter);

// ── Routes ──
app.use('/',          require('./routes/public'));
app.use('/dashboard', require('./routes/dashboard'));
app.use('/flamme',    require('./routes/flamme'));
app.use('/admin',     require('./routes/admin'));

// ── 404 ──
app.use(function(req, res) {
  res.status(404).send(page404());
});

// ── Gestionnaire erreurs global ──
app.use(function(err, req, res, next) {
  console.error('[ERROR]', err.message);
  if (res.headersSent) return next(err);
  res.status(500).redirect('/');
});

// ── Demarrage ──
app.listen(PORT, function() {
  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║  🇳🇪   BAC TOOLS NIGER 2026 — v6.0 FINAL    ║');
  console.log('║  🔒   Securise + Compresse + Rate Limited    ║');
  console.log('║  🌐   http://localhost:' + PORT + '                 ║');
  console.log('╚══════════════════════════════════════════════╝\n');
  if (!process.env.SUPABASE_URL) console.warn('[WARN] SUPABASE_URL non defini');
  if (!process.env.SUPABASE_KEY) console.warn('[WARN] SUPABASE_KEY non defini');
});

function page404() {
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>404</title><style>*{margin:0;padding:0;}body{background:#080D1A;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;text-align:center;}.flag{position:fixed;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,#FF7518 33.3%,#FFF 33.3%,#FFF 66.6%,#29AB47 66.6%);}h1{font-size:3rem;color:#FF7518;}p{color:rgba(255,255,255,0.5);margin:10px 0 20px;}a{background:linear-gradient(135deg,#FF7518,#FF4500);color:white;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:700;}</style></head><body><div class="flag"></div><div><div style="font-size:4rem;margin-bottom:12px;">🇳🇪</div><h1>404</h1><p>Page introuvable</p><a href="/">Accueil</a></div></body></html>';
}

function page429() {
  return '<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Trop de tentatives</title><style>*{margin:0;padding:0;}body{background:#080D1A;color:white;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;text-align:center;}.flag{position:fixed;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,#FF7518 33.3%,#FFF 33.3%,#FFF 66.6%,#29AB47 66.6%);}h1{font-size:2rem;color:#FF7518;}p{color:rgba(255,255,255,0.5);margin:10px 0 20px;}a{background:rgba(255,255,255,0.08);color:white;padding:12px 28px;border-radius:12px;text-decoration:none;font-weight:700;}</style></head><body><div class="flag"></div><div><div style="font-size:3rem;margin-bottom:12px;">🔒</div><h1>Trop de tentatives</h1><p>Attends 15 minutes avant de reessayer.</p><a href="/">Accueil</a></div></body></html>';
}

module.exports = app;
