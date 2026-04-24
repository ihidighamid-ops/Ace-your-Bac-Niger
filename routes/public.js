'use strict';

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const supabase = require('../db/supabase');
const { CSS, STARS_JS } = require('../utils/styles');
const { sanitize, cleanPhone, genCodeAnonyme, logAction } = require('../utils/helpers');

const WHATSAPP_NUM = '22781538341';

// ════════════════════════════════════════════════════════════
// SUPERADMIN — identifiants lus depuis variables d'env
// JAMAIS dans le HTML, JAMAIS dans les logs
// ════════════════════════════════════════════════════════════
const ADMIN_PHONE      = process.env.ADMIN_PHONE       || '22799193823';
const ADMIN_MASTER_KEY = process.env.ADMIN_MASTER_KEY  || 'ADMIN2026Bacniger';

// Comparaison sécurisée caractère par caractère (timing-safe basique)
function verifyAdminCode(saisi) {
  const ref = ADMIN_MASTER_KEY;
  if (!saisi || !ref) return false;
  if (saisi.length !== ref.length) return false;
  let ok = true;
  for (let i = 0; i < ref.length; i++) {
    if (saisi.charCodeAt(i) !== ref.charCodeAt(i)) ok = false;
  }
  return ok;
}

// ── Upload reçus ──
const uploadRecu = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const d = path.join(__dirname, '../public/recus');
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      cb(null, d);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, 'recu-' + Date.now() + '-' + Math.random().toString(36).slice(2) + ext);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) cb(null, true);
    else cb(new Error('Format non accepte. Utilise jpg, png ou pdf.'));
  }
});

// ════════════════════════════════════════════════════════════
// ACCUEIL
// ════════════════════════════════════════════════════════════
router.get('/', async function(req, res) {
  if (req.session.userId)    return res.redirect('/dashboard');
  if (req.session.adminAuth) return res.redirect('/admin');
  let inscritCount = 0;
  try {
    const r = await supabase.from('users').select('*', { count: 'exact', head: true });
    inscritCount = r.count || 0;
  } catch(e) {}
  res.send(pageAccueil(inscritCount));
});

// ════════════════════════════════════════════════════════════
// BIENVENUE
// ════════════════════════════════════════════════════════════
router.get('/bienvenue', function(req, res) {
  if (req.session.userId)    return res.redirect('/dashboard');
  if (req.session.adminAuth) return res.redirect('/admin');
  res.send(pageBienvenue());
});

// ════════════════════════════════════════════════════════════
// INSCRIPTION
// ════════════════════════════════════════════════════════════
router.get('/inscription', function(req, res) {
  if (req.session.userId) return res.redirect('/dashboard');
  res.send(pageInscription(null, null));
});

router.post('/inscription', async function(req, res) {
  try {
    const nom       = sanitize(req.body.nom);
    const prenom    = sanitize(req.body.prenom);
    const dob       = sanitize(req.body.date_naissance);
    const ecole     = sanitize(req.body.ecole);
    const serie     = req.body.serie || '';
    const ville     = sanitize(req.body.ville);
    const telephone = cleanPhone(req.body.telephone);

    if (!nom || !prenom || !ecole || !serie || !ville || !telephone)
      return res.send(pageInscription('Remplis tous les champs obligatoires.', null));

    if (!/^\d{8,12}$/.test(telephone))
      return res.send(pageInscription('Numero de telephone invalide (8 a 12 chiffres, sans espaces).', null));

    const seriesOk = ['Terminale D','Terminale A','Terminale C','Terminale G2','Autre'];
    if (!seriesOk.includes(serie))
      return res.send(pageInscription('Selectionne une serie valide.', null));

    // Verifier doublon
    const { data: existing } = await supabase
      .from('users').select('id').eq('telephone', telephone).single();
    if (existing) return res.send(pageInscription(null, 'Tu es deja inscrit ! Connecte-toi.'));

    // Code anonyme unique
    let codeAnonyme = genCodeAnonyme();
    for (let i = 0; i < 5; i++) {
      const { data: dup } = await supabase
        .from('users').select('id').eq('code_anonyme', codeAnonyme).single();
      if (!dup) break;
      codeAnonyme = genCodeAnonyme();
    }

    const { error: insErr } = await supabase.from('users').insert({
      nom: nom.toUpperCase(), prenom, date_naissance: dob || null,
      ecole, serie, ville, telephone,
      code_anonyme: codeAnonyme,
      role: 'eleve', actif: true, paye: false
    });

    if (insErr) {
      if (insErr.code === '23505') return res.send(pageInscription(null, 'Tu es deja inscrit !'));
      throw insErr;
    }

    await logAction(supabase, null, 'inscription', prenom + ' ' + nom + ' — ' + telephone, req.ip);
    return res.redirect('/paiement');

  } catch(err) {
    console.error('[ERR inscription]', err.message);
    res.send(pageInscription('Erreur serveur. Reessaie dans quelques instants.', null));
  }
});

// ════════════════════════════════════════════════════════════
// PAIEMENT
// ════════════════════════════════════════════════════════════
router.get('/paiement', function(req, res) {
  res.send(pagePaiement(null));
});

router.post('/paiement', uploadRecu.single('recu'), async function(req, res) {
  const deleteFile = function(f) { try { if (f) fs.unlinkSync(f); } catch(e) {} };
  try {
    const telephone = cleanPhone(req.body.telephone);

    if (!telephone)    return res.send(pagePaiement('Entre ton numero de telephone.'));
    if (!req.file)     return res.send(pagePaiement('Selectionne une photo ou capture du recu.'));

    if (!/^\d{8,12}$/.test(telephone)) {
      deleteFile(req.file.path);
      return res.send(pagePaiement('Numero invalide. Entre le numero utilise lors de l inscription.'));
    }

    const { data: user } = await supabase
      .from('users').select('*').eq('telephone', telephone).single();

    if (!user) {
      deleteFile(req.file.path);
      return res.send(pagePaiement(
        'Numero non trouve. Inscris-toi d abord en cliquant sur "Creer mon compte".'
      ));
    }

    // Supprimer ancien recu
    if (user.recu_url) {
      const old = path.join(__dirname, '../public/recus', path.basename(user.recu_url));
      if (fs.existsSync(old)) { try { fs.unlinkSync(old); } catch(e) {} }
    }

    await supabase.from('users')
      .update({ recu_url: '/recus-media/' + req.file.filename })
      .eq('id', user.id);

    const waText = [
      '🇳🇪 *PAIEMENT — Bac Tools Niger 2026*', '',
      '*' + user.prenom + ' ' + user.nom + '*',
      'Tel: ' + user.telephone,
      'Ecole: ' + (user.ecole || '-'),
      'Serie: ' + (user.serie || '-'),
      'Ville: ' + (user.ville || '-'),
      'Montant: 3 000 FCFA | Recu uploade ✅', '',
      'Va sur /admin -> Generer code pour activer.'
    ].join('\n');

    const waLink = 'https://wa.me/' + WHATSAPP_NUM + '?text=' + encodeURIComponent(waText);
    await logAction(supabase, user.id, 'paiement_soumis', user.prenom + ' ' + user.nom, req.ip);
    return res.send(pageConfirmPaiement(waLink));

  } catch(err) {
    console.error('[ERR paiement]', err.message);
    deleteFile(req.file && req.file.path);
    res.send(pagePaiement('Erreur serveur. Reessaie.'));
  }
});

// ════════════════════════════════════════════════════════════
// CONNEXION — LOGIQUE ADMIN CRITIQUE
//
// SUPERADMIN : telephone=ADMIN_PHONE + code=ADMIN_MASTER_KEY
//   → verification 100% backend (variables d'env)
//   → redirection /admin IMMEDIATE sans passer par la DB
//   → fallback DB : si le telephone existe aussi en DB avec
//     role superadmin, la verification DB fonctionne aussi
//
// ADMIN secondaire : role admin/superadmin en DB + code_acces
//
// ELEVE : paye=true + code_acces correspondant
// ════════════════════════════════════════════════════════════
router.get('/connexion', function(req, res) {
  if (req.session.userId)    return res.redirect('/dashboard');
  if (req.session.adminAuth) return res.redirect('/admin');
  res.send(pageConnexion(null));
});

router.post('/connexion', async function(req, res) {
  const telephone = cleanPhone(req.body.telephone);
  const codeSaisi = (req.body.code || '').trim();

  // Validation inputs
  if (!telephone || !codeSaisi) {
    return res.send(pageConnexion('Entre ton numero et ton code d acces.'));
  }

  try {
    // ════════════════════════════════════════════════════════
    // CAS 1 : SUPERADMIN via variables d'environnement
    // La verification se fait AVANT toute requete DB
    // Si la DB est down, l'admin peut quand meme se connecter
    // ════════════════════════════════════════════════════════
    if (telephone === ADMIN_PHONE && verifyAdminCode(codeSaisi)) {
      req.session.adminAuth    = true;
      req.session.adminTel     = ADMIN_PHONE;
      req.session.isSuperAdmin = true;
      // Log asynchrone non bloquant
      logAction(supabase, null, 'connexion_superadmin', telephone, req.ip).catch(() => {});
      return res.redirect('/admin');
    }

    // ════════════════════════════════════════════════════════
    // CAS 2 : Verification en base de données
    // ════════════════════════════════════════════════════════
    const { data: user, error: dbErr } = await supabase
      .from('users').select('*').eq('telephone', telephone).single();

    if (dbErr || !user) {
      return res.send(pageConnexion(
        'Numero non trouve. Inscris-toi d abord ou verifie ton numero.'
      ));
    }

    if (!user.actif) {
      return res.send(pageConnexion('Compte desactive. Contacte l administrateur.'));
    }

    // ── Admin base de données ──
    if (user.role === 'admin' || user.role === 'superadmin') {
      if (!user.code_acces) {
        return res.send(pageConnexion('Code admin non configure. Contacte le support.'));
      }
      const codeOk = codeSaisi.toUpperCase() === user.code_acces.toUpperCase();
      if (!codeOk) {
        await logAction(supabase, user.id, 'echec_connexion_admin', telephone, req.ip);
        return res.send(pageConnexion('Code incorrect.'));
      }
      req.session.adminAuth    = true;
      req.session.adminTel     = telephone;
      req.session.isSuperAdmin = (user.role === 'superadmin');
      await supabase.from('users')
        .update({ derniere_connexion: new Date().toISOString() })
        .eq('id', user.id);
      await logAction(supabase, user.id, 'connexion_admin', telephone, req.ip);
      return res.redirect('/admin');
    }

    // ── Eleve standard ──
    if (!user.paye) {
      return res.send(pageConnexion(
        'Paiement pas encore valide. Patiente ou contacte le support WhatsApp.'
      ));
    }
    if (!user.code_acces) {
      return res.send(pageConnexion(
        'Ton code d acces n a pas encore ete envoye. Patiente.'
      ));
    }
    if (codeSaisi.toUpperCase() !== user.code_acces.toUpperCase()) {
      await logAction(supabase, user.id, 'echec_connexion', telephone, req.ip);
      return res.send(pageConnexion('Code incorrect. Verifie le code recu par WhatsApp.'));
    }

    req.session.userId   = user.id;
    req.session.userRole = user.role;
    await supabase.from('users')
      .update({ derniere_connexion: new Date().toISOString() })
      .eq('id', user.id);
    await logAction(supabase, user.id, 'connexion', telephone, req.ip);
    return res.redirect('/dashboard');

  } catch(err) {
    console.error('[ERR connexion]', err.message);
    res.send(pageConnexion('Erreur serveur. Reessaie.'));
  }
});

// ── Logout ──
router.get('/logout', function(req, res) {
  req.session.destroy();
  res.redirect('/');
});

// ════════════════════════════════════════════════════════════
// TEMPLATES HTML
// ════════════════════════════════════════════════════════════

function pageAccueil(count) {
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#080D1A">
<meta name="description" content="Bac Tools Niger 2026 - La plateforme des terminales nigeriens">
<title>Bac Tools Niger 2026</title>
${CSS}
<style>
body{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:20px;padding-top:25px;text-align:center;}
.hero{max-width:400px;width:100%;z-index:1;position:relative;}
.logo{font-size:4rem;margin-bottom:14px;display:block;animation:float 3s ease-in-out infinite;}
.title{font-family:'Syne',sans-serif;font-size:2rem;font-weight:800;line-height:1.15;margin-bottom:8px;}
.title span{background:linear-gradient(135deg,#FF7518,#FF4500);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;}
.sub{color:rgba(255,255,255,0.5);font-size:14px;margin-bottom:20px;line-height:1.55;}
.badge-count{display:inline-flex;align-items:center;gap:6px;background:rgba(41,171,71,0.12);border:1px solid rgba(41,171,71,0.3);color:#86efac;border-radius:100px;padding:6px 16px;font-size:12px;font-family:'Syne',sans-serif;font-weight:700;margin-bottom:24px;}
.feats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:26px;text-align:left;}
.feat{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:14px;}
.feat-i{font-size:1.35rem;margin-bottom:5px;display:block;}
.feat-t{font-family:'Syne',sans-serif;font-weight:700;font-size:13px;color:white;margin-bottom:2px;}
.feat-d{font-size:11px;color:rgba(255,255,255,0.4);line-height:1.4;}
</style>
</head><body>
<div class="flag"></div>
${STARS_JS}
<div class="hero fadeUp">
  <span class="logo">🇳🇪</span>
  <h1 class="title">Bac Tools <span>Niger</span></h1>
  <p class="sub">La plateforme officielle des eleves<br>de Terminale au Niger — BAC 2026</p>
  ${count > 0 ? `<div class="badge-count">✅ ${count} eleves inscrits</div>` : ''}
  <div class="feats">
    <div class="feat"><span class="feat-i">📚</span><div class="feat-t">16 Outils BAC</div><div class="feat-d">Annales, cours, videos</div></div>
    <div class="feat"><span class="feat-i">🤖</span><div class="feat-t">IA Professeur</div><div class="feat-d">Disponible 24h/24</div></div>
    <div class="feat"><span class="feat-i">💬</span><div class="feat-t">Chat Eleves</div><div class="feat-d">La Flamme Nigerienne</div></div>
    <div class="feat"><span class="feat-i">📱</span><div class="feat-t">Mobile First</div><div class="feat-d">Optimise smartphone</div></div>
  </div>
  <a href="/bienvenue" class="btn-orange" style="font-size:1.05rem;padding:18px;">Continuer →</a>
  <p style="margin-top:16px;font-size:12px;color:rgba(255,255,255,0.3);">
    Deja inscrit ? <a href="/connexion" style="color:#FF7518;text-decoration:none;font-weight:700;">Me connecter</a>
  </p>
</div>
</body></html>`;
}

function pageBienvenue() {
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#080D1A">
<title>Bienvenue — Bac Tools Niger 2026</title>
${CSS}
<style>
body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;padding-top:25px;}
.wrap{max-width:400px;width:100%;z-index:1;}
.offer{background:linear-gradient(135deg,rgba(255,117,24,0.14),rgba(255,69,0,0.06));border:2px solid rgba(255,117,24,0.3);border-radius:20px;padding:22px;margin-bottom:22px;}
</style>
</head><body>
<div class="flag"></div>
${STARS_JS}
<div class="wrap fadeUp">
  <div style="text-align:center;margin-bottom:22px;">
    <a href="/" style="color:rgba(255,255,255,0.3);text-decoration:none;font-size:13px;">← Retour</a>
    <div style="font-size:3rem;margin:12px 0 8px;">🎓</div>
    <h1 class="ht" style="font-size:1.6rem;font-weight:800;margin-bottom:8px;">Bienvenue !</h1>
    <p style="color:rgba(255,255,255,0.5);font-size:14px;line-height:1.6;">Acces complet a tous les outils<br>pour reussir ton BAC 2026.</p>
  </div>
  <div class="offer" style="text-align:center;">
    <div style="font-size:11px;color:rgba(255,255,255,0.4);font-family:'Syne',sans-serif;font-weight:700;letter-spacing:0.08em;margin-bottom:4px;">ACCES COMPLET A VIE</div>
    <div style="font-family:'Space Mono',monospace;font-size:2.5rem;font-weight:700;color:#FF7518;margin:4px 0;">3 000 FCFA</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-bottom:16px;">Paiement unique — Mobile Money</div>
    <div style="text-align:left;font-size:13px;color:rgba(255,255,255,0.7);line-height:2;">
      ✅ 16 outils educatifs BAC Niger<br>
      ✅ Annales corrigees 2010–2025<br>
      ✅ Cours video toutes matieres<br>
      ✅ IA Professeur 24h/24<br>
      ✅ Chat La Flamme Nigerienne<br>
      ✅ Bibliotheque africaine digitale
    </div>
  </div>
  <div style="display:flex;flex-direction:column;gap:12px;">
    <a href="/inscription" class="btn-orange">🚀 Creer mon compte — 3 000 FCFA</a>
    <a href="/connexion"   class="btn-ghost">🔑 J'ai deja un compte</a>
  </div>
  <p style="text-align:center;margin-top:14px;font-size:11px;color:rgba(255,255,255,0.2);">🔒 Paiement securise · Support WhatsApp disponible</p>
</div>
</body></html>`;
}

function pageInscription(errMsg, infoMsg) {
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#080D1A">
<title>Inscription — Bac Tools Niger 2026</title>
${CSS}
<style>
body{padding:25px 18px 40px;min-height:100vh;}
.wrap{max-width:420px;margin:0 auto;padding-top:18px;}
.f{margin-bottom:16px;}
</style>
</head><body>
<div class="flag"></div>
${STARS_JS}
<div class="wrap fadeUp">
  <div style="text-align:center;margin-bottom:22px;">
    <a href="/bienvenue" style="color:rgba(255,255,255,0.3);text-decoration:none;font-size:13px;">← Retour</a>
    <div style="font-size:2rem;margin:12px 0 8px;">✍️</div>
    <h1 class="ht" style="font-size:1.5rem;font-weight:800;">Creer mon compte</h1>
    <p style="color:rgba(255,255,255,0.4);font-size:13px;margin-top:5px;">Etape 1 sur 2</p>
  </div>
  ${errMsg  ? `<div class="err">❌ ${sanitize(errMsg)}</div>` : ''}
  ${infoMsg ? `<div class="suc">✅ ${sanitize(infoMsg)} <a href="/connexion" style="color:#86efac;font-weight:700;">Me connecter →</a></div>` : ''}
  <div class="card" style="padding:22px;">
    <form method="POST" action="/inscription">
      <div class="f"><label class="label">Nom *</label>
        <input class="inp" type="text" name="nom" placeholder="MAHAMANE" required maxlength="50" autocomplete="family-name"></div>
      <div class="f"><label class="label">Prenom *</label>
        <input class="inp" type="text" name="prenom" placeholder="Moussa" required maxlength="50" autocomplete="given-name"></div>
      <div class="f"><label class="label">Date de naissance</label>
        <input class="inp" type="date" name="date_naissance" autocomplete="bday"></div>
      <div class="f"><label class="label">Ecole *</label>
        <input class="inp" type="text" name="ecole" placeholder="Lycee Issa Korombe" required maxlength="100"></div>
      <div class="f"><label class="label">Ville / Region *</label>
        <input class="inp" type="text" name="ville" placeholder="Niamey" required maxlength="60" autocomplete="address-level2"></div>
      <div class="f"><label class="label">Serie *</label>
        <select class="inp" name="serie" required>
          <option value="" disabled selected>Selectionne ta serie</option>
          <option value="Terminale D">Terminale D — Sciences exactes</option>
          <option value="Terminale A">Terminale A — Lettres</option>
          <option value="Terminale C">Terminale C — Mathematiques</option>
          <option value="Terminale G2">Terminale G2 — Gestion</option>
          <option value="Autre">Autre</option>
        </select></div>
      <div class="f"><label class="label">Numero de telephone *</label>
        <input class="inp" type="tel" name="telephone" placeholder="Ex: 90000000" required maxlength="12" inputmode="numeric" autocomplete="tel">
        <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:4px;">
          ⚠️ Note ce numero — c'est ton identifiant de connexion
        </div></div>
      <button type="submit" class="btn-orange" style="margin-top:8px;">Continuer vers le paiement →</button>
    </form>
  </div>
  <p style="text-align:center;margin-top:14px;font-size:12px;color:rgba(255,255,255,0.3);">
    Deja inscrit ? <a href="/connexion" style="color:#FF7518;text-decoration:none;font-weight:700;">Me connecter</a>
  </p>
</div>
</body></html>`;
}

function pagePaiement(errMsg) {
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#080D1A">
<title>Paiement — Bac Tools Niger 2026</title>
${CSS}
<style>
body{padding:25px 18px 40px;min-height:100vh;}
.wrap{max-width:420px;margin:0 auto;padding-top:18px;}
.step{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:16px;padding:18px;margin-bottom:12px;}
.snum{width:27px;height:27px;background:linear-gradient(135deg,#FF7518,#FF4500);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:13px;color:white;flex-shrink:0;}
.srow{display:flex;align-items:flex-start;gap:12px;}
.numbox{background:rgba(255,117,24,0.1);border:2px solid rgba(255,117,24,0.35);border-radius:12px;padding:10px 16px;font-family:'Space Mono',monospace;font-size:1.3rem;font-weight:700;color:#FF7518;text-align:center;margin:8px 0;letter-spacing:0.04em;}
</style>
</head><body>
<div class="flag"></div>
${STARS_JS}
<div class="wrap fadeUp">
  <div style="text-align:center;margin-bottom:22px;">
    <a href="/inscription" style="color:rgba(255,255,255,0.3);text-decoration:none;font-size:13px;">← Retour</a>
    <div style="font-size:2rem;margin:12px 0 8px;">💳</div>
    <h1 class="ht" style="font-size:1.5rem;font-weight:800;">Paiement Mobile Money</h1>
    <p style="color:rgba(255,255,255,0.4);font-size:13px;margin-top:5px;">Etape 2 sur 2 — Finalise ton inscription</p>
  </div>
  ${errMsg ? `<div class="err">❌ ${sanitize(errMsg)}</div>` : ''}
  <div class="step">
    <div class="srow"><div class="snum">1</div>
      <div><div class="ht" style="font-weight:700;font-size:14px;color:white;margin-bottom:4px;">Envoie 3 000 FCFA sur ce numero</div>
      <div class="numbox">+227 81 53 83 41</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.4);">Airtel Money · Moov Money · Orange Money</div>
    </div></div>
  </div>
  <div class="step">
    <div class="srow"><div class="snum">2</div>
      <div><div class="ht" style="font-weight:700;font-size:14px;color:white;margin-bottom:4px;">Fais une capture du recu</div>
      <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.5;">Photo de la confirmation de la transaction sur ton telephone.</div>
    </div></div>
  </div>
  <div class="step" style="border-color:rgba(255,117,24,0.25);background:rgba(255,117,24,0.04);">
    <div class="srow"><div class="snum">3</div>
      <div style="width:100%;">
        <div class="ht" style="font-weight:700;font-size:14px;color:white;margin-bottom:12px;">Envoie ton recu ici</div>
        <form method="POST" action="/paiement" enctype="multipart/form-data">
          <div style="margin-bottom:12px;">
            <label class="label">Ton numero de telephone *</label>
            <input class="inp" type="tel" name="telephone" placeholder="Ex: 90 12 34 56" required inputmode="numeric" maxlength="12">
            <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:3px;">Le meme numero utilise lors de l inscription</div>
          </div>
          <div style="margin-bottom:14px;">
            <label class="label">Photo / Capture du recu *</label>
            <input class="inp" type="file" name="recu" accept="image/*,.pdf" required style="padding:10px;cursor:pointer;">
            <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:3px;">Photo ou PDF — max 10 Mo</div>
          </div>
          <button type="submit" class="btn-orange">📤 Envoyer le recu</button>
        </form>
      </div>
    </div>
  </div>
  <div class="info" style="margin-top:12px;">⏳ <strong>Delai :</strong> Ton code sera envoye par WhatsApp dans les 2–12h apres reception.</div>
</div>
</body></html>`;
}

function pageConfirmPaiement(waLink) {
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#080D1A">
<title>Recu envoye — Bac Tools Niger 2026</title>
${CSS}
<style>
body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;padding-top:25px;}
.wrap{max-width:400px;width:100%;text-align:center;z-index:1;}
.wa{background:linear-gradient(135deg,#25D366,#128C7E);color:white;border:none;border-radius:14px;padding:16px;font-family:'Syne',sans-serif;font-weight:700;font-size:15px;width:100%;text-decoration:none;display:block;margin-bottom:12px;cursor:pointer;}
</style>
</head><body>
<div class="flag"></div>
${STARS_JS}
<div class="wrap fadeUp">
  <div style="font-size:4rem;margin-bottom:14px;animation:float 2s ease-in-out infinite;">✅</div>
  <h1 class="ht" style="font-size:1.6rem;font-weight:800;margin-bottom:8px;color:#86efac;">Recu envoye !</h1>
  <p style="color:rgba(255,255,255,0.5);font-size:14px;line-height:1.7;margin-bottom:22px;">
    Ton recu a bien ete recu.<br>L'admin va valider et t'envoyer<br>
    <strong style="color:white;">ton code d'acces par WhatsApp</strong>.
  </p>
  <div class="card" style="padding:18px;margin-bottom:22px;text-align:left;">
    <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:8px;font-family:'Syne',sans-serif;font-weight:700;">PROCHAINES ETAPES</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.6);line-height:2;">
      1️⃣ L'admin voit ta notification<br>
      2️⃣ Il verifie ton recu<br>
      3️⃣ Il active ton compte<br>
      4️⃣ Tu recois ton code par WhatsApp<br>
      5️⃣ Tu te connectes et accedes a la plateforme !
    </div>
  </div>
  <a href="${sanitize(waLink)}" class="wa" target="_blank" rel="noopener noreferrer">📲 Support WhatsApp</a>
  <a href="/connexion" class="btn-ghost">🔑 J'ai deja mon code</a>
  <p style="margin-top:14px;font-size:11px;color:rgba(255,255,255,0.2);">Support : +227 81 53 83 41</p>
</div>
</body></html>`;
}

function pageConnexion(errMsg) {
  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#080D1A">
<title>Connexion — Bac Tools Niger 2026</title>
${CSS}
<style>
body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;padding-top:25px;}
.wrap{max-width:400px;width:100%;z-index:1;}
.f{margin-bottom:18px;}
.eye{position:absolute;right:13px;top:50%;transform:translateY(-50%);background:none;border:none;color:rgba(255,255,255,0.35);cursor:pointer;font-size:18px;padding:4px;line-height:1;}
</style>
</head><body>
<div class="flag"></div>
${STARS_JS}
<div class="wrap fadeUp">
  <div style="text-align:center;margin-bottom:22px;">
    <a href="/" style="color:rgba(255,255,255,0.3);text-decoration:none;font-size:13px;">← Accueil</a>
    <div style="font-size:3rem;margin:12px 0 8px;">🔑</div>
    <h1 class="ht" style="font-size:1.5rem;font-weight:800;">Se connecter</h1>
    <p style="color:rgba(255,255,255,0.4);font-size:13px;margin-top:5px;">Entre tes identifiants pour acceder a la plateforme</p>
  </div>
  ${errMsg ? `<div class="err">❌ ${sanitize(errMsg)}</div>` : ''}
  <div class="card" style="padding:24px;">
    <form method="POST" action="/connexion" autocomplete="off">
      <div class="f">
        <label class="label">Numero de telephone</label>
        <input class="inp" type="tel" name="telephone" id="telInput"
          placeholder="Ex: 90000000" required inputmode="numeric" maxlength="15">
      </div>
      <div class="f">
        <label class="label">Code d'acces</label>
        <div style="position:relative;">
          <input class="inp" type="password" name="code" id="codeInput"
            placeholder="Ton code recu par WhatsApp"
            required maxlength="30" style="padding-right:48px;"
            autocomplete="current-password">
          <button type="button" class="eye" onclick="togglePwd()" id="eyeBtn">👁</button>
        </div>
        <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:4px;">
          Code recu par WhatsApp apres validation du paiement
        </div>
      </div>
      <button type="submit" class="btn-orange">Se connecter →</button>
    </form>
  </div>
  <div style="text-align:center;margin-top:18px;display:flex;flex-direction:column;gap:8px;">
    <p style="font-size:12px;color:rgba(255,255,255,0.3);">
      Pas encore inscrit ? <a href="/inscription" style="color:#FF7518;text-decoration:none;font-weight:700;">Creer un compte</a>
    </p>
    <p style="font-size:12px;color:rgba(255,255,255,0.2);">
      Probleme ? <a href="https://wa.me/22781538341" target="_blank" style="color:#25D366;text-decoration:none;font-weight:700;">Support WhatsApp</a>
    </p>
  </div>
</div>
<script>
function togglePwd(){
  var i=document.getElementById('codeInput');
  var b=document.getElementById('eyeBtn');
  if(i.type==='password'){i.type='text';b.textContent='🙈';}
  else{i.type='password';b.textContent='👁';}
}
</script>
</body></html>`;
}

module.exports = router;
