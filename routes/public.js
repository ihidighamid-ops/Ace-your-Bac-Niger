'use strict';

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const supabase = require('../db/supabase');
const { CSS, STARS_JS } = require('../utils/styles');
const {
  sanitize, cleanPhone, genCodeAnonyme, logAction,
  uploadToStorage, deleteFromStorage
} = require('../utils/helpers');

// ── Multer en mémoire (plus de stockage local — upload vers Supabase Storage) ──
const uploadRecu = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 10 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const allowed = ['image/jpeg','image/png','image/gif','image/webp','application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Format non accepte. Utilise jpg, png ou pdf.'));
  }
});

// ════════════════════════════════════════════════════════════
// SUPERADMIN — identifiants lus depuis variables d'env UNIQUEMENT
// ════════════════════════════════════════════════════════════
const ADMIN_PHONE      = process.env.ADMIN_PHONE       || '22799193823';
const ADMIN_MASTER_KEY = process.env.ADMIN_MASTER_KEY  || 'ADMIN2026Bacniger';
const WHATSAPP_NUM     = '22781500171';

function verifyAdminCode(saisi) {
  const ref = ADMIN_MASTER_KEY;
  if (!saisi || !ref || saisi.length !== ref.length) return false;
  let ok = true;
  for (let i = 0; i < ref.length; i++) {
    if (saisi.charCodeAt(i) !== ref.charCodeAt(i)) ok = false;
  }
  return ok;
}

// ════════════════════════════════════════════════════════════
// APERCU — accueil visible même pour admin connecté
// ════════════════════════════════════════════════════════════
router.get('/apercu', async function(req, res) {
  let inscritCount = 0;
  try {
    const r = await supabase.from('users').select('*', { count: 'exact', head: true });
    // Compteur public = vrais inscrits + 90 (boost social proof)
    inscritCount = (r.count || 0) + 90;
  } catch(e) {}
  res.send(pageAccueil(inscritCount));
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
    // Compteur public = vrais inscrits + 90 (boost social proof)
    inscritCount = (r.count || 0) + 90;
  } catch(e) { console.error('[ERR accueil count]', e.message); }
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

    // ── Validation backend stricte ──
    if (!nom || !prenom || !ecole || !serie || !ville || !telephone) {
      return res.send(pageInscription('Remplis tous les champs obligatoires.', null));
    }
    if (nom.length > 50 || prenom.length > 50) {
      return res.send(pageInscription('Nom ou prenom trop long (50 caracteres max).', null));
    }
    if (!/^\d{8,12}$/.test(telephone)) {
      return res.send(pageInscription('Numero de telephone invalide (8 a 12 chiffres, sans espaces).', null));
    }
    const seriesOk = ['Terminale D','Terminale A','Terminale C','Terminale G2','Autre'];
    if (!seriesOk.includes(serie)) {
      return res.send(pageInscription('Selectionne une serie valide.', null));
    }

    console.log('[INSCRIPTION] Tentative:', { nom, prenom, telephone, ecole, serie, ville });

    // ── BUG FIX : .maybeSingle() au lieu de .single() ──
    const { data: existing, error: checkErr } = await supabase
      .from('users').select('id').eq('telephone', telephone).maybeSingle();

    if (checkErr) {
      console.error('[INSCRIPTION] Erreur doublon check:', checkErr.message);
      return res.send(pageInscription('Erreur serveur lors de la verification. Reessaie.', null));
    }
    if (existing) {
      return res.send(pageInscription(null, 'Tu es deja inscrit ! Connecte-toi.'));
    }

    // ── Code anonyme unique ──
    let codeAnonyme = genCodeAnonyme();
    for (let i = 0; i < 5; i++) {
      const { data: dup } = await supabase
        .from('users').select('id').eq('code_anonyme', codeAnonyme).maybeSingle();
      if (!dup) break;
      codeAnonyme = genCodeAnonyme();
    }

    // ── Insertion avec statut "inscrit" ──
    console.log('[INSCRIPTION] Insertion en cours pour:', telephone);
    const { data: newUser, error: insErr } = await supabase
      .from('users')
      .insert({
        nom:           nom.toUpperCase(),
        prenom,
        date_naissance: dob || null,
        ecole,
        serie,
        ville,
        telephone,
        code_anonyme:  codeAnonyme,
        role:          'eleve',
        statut:        'inscrit',
        actif:         true,
        paye:          false
      })
      .select('id')
      .single();

    if (insErr) {
      console.error('[INSCRIPTION] Erreur insertion:', insErr.message, insErr.code);
      if (insErr.code === '23505') {
        return res.send(pageInscription(null, 'Tu es deja inscrit !'));
      }
      return res.send(pageInscription('Erreur lors de la creation du compte : ' + insErr.message, null));
    }

    console.log('[INSCRIPTION] SUCCESS userId:', newUser.id);

    // SECURITE : on stocke uniquement pendingUserId (pas userId)
    // userId ne sera créé que dans POST /connexion après vérification du code
    req.session.pendingUserId = newUser.id;
    req.session.userPhone     = telephone;

    await logAction(supabase, newUser.id, 'inscription', prenom + ' ' + nom + ' — ' + telephone, req.ip);

    return res.redirect('/paiement');

  } catch(err) {
    console.error('[ERR inscription]', err.message);
    res.send(pageInscription('Erreur serveur inattendue. Reessaie dans quelques instants.', null));
  }
});

// ════════════════════════════════════════════════════════════
// PAIEMENT — PAGE TOUJOURS VISIBLE (session optionnelle)
// ════════════════════════════════════════════════════════════
router.get('/paiement', async function(req, res) {
  try {
    // Utilisateur déjà validé avec session complète
    if (req.session.userId) {
      const { data: user, error } = await supabase
        .from('users').select('id, prenom, nom, statut, paye')
        .eq('id', req.session.userId).maybeSingle();
      if (error) console.error('[PAIEMENT GET] Erreur DB:', error.message);
      if (user && user.paye && user.statut === 'valide') {
        return res.redirect('/connexion');
      }
      return res.send(pagePaiement(null, user));
    }
    // Juste inscrit — session temporaire pendingUserId (pas encore de code validé)
    if (req.session.pendingUserId) {
      const { data: user } = await supabase
        .from('users').select('id, prenom, nom, statut, paye')
        .eq('id', req.session.pendingUserId).maybeSingle();
      return res.send(pagePaiement(null, user || null));
    }
    return res.send(pagePaiement(null, null));
  } catch(err) {
    console.error('[ERR GET paiement]', err.message);
    res.send(pagePaiement(null, null));
  }
});

router.post('/paiement', uploadRecu.single('recu'), async function(req, res) {
  try {
    if (!req.file) {
      return res.send(pagePaiement('Selectionne une photo ou capture du recu.', null));
    }

    let userId = req.session.userId || null;
    let user   = null;

    // CAS 1 : session complète validée (userId) → identifier par userId
    if (userId) {
      const { data: u, error: uErr } = await supabase
        .from('users').select('*').eq('id', userId).maybeSingle();
      if (uErr) console.error('[PAIEMENT POST] Erreur session user:', uErr.message);
      user = u || null;
    }

    // CAS 2 : juste inscrit — session temporaire pendingUserId
    if (!user && req.session.pendingUserId) {
      const { data: u, error: uErr } = await supabase
        .from('users').select('*').eq('id', req.session.pendingUserId).maybeSingle();
      if (uErr) console.error('[PAIEMENT POST] Erreur pendingUserId:', uErr.message);
      if (u) {
        user   = u;
        userId = u.id;
        // NE PAS créer session.userId ici — l'élève doit entrer son code dans /connexion
      }
    }

    // CAS 3 : aucune session → identifier par téléphone saisi dans le formulaire
    if (!user) {
      const telephone = cleanPhone(req.body.telephone);
      if (!telephone || !/^\d{8,12}$/.test(telephone)) {
        return res.send(pagePaiement('Entre ton numero de telephone (8 a 12 chiffres).', null));
      }
      const { data: u, error: uErr } = await supabase
        .from('users').select('*').eq('telephone', telephone).maybeSingle();
      if (uErr) console.error('[PAIEMENT POST] Erreur tel user:', uErr.message);
      if (!u) {
        return res.send(pagePaiement(
          'Numero non trouve. Inscris-toi d\'abord ou verifie ton numero.', null
        ));
      }
      user   = u;
      userId = u.id;
      // NE PAS créer session.userId ici non plus — code requis
    }

    console.log('[PAIEMENT] Upload pour userId:', userId, '| fichier:', req.file.originalname);

    // Supprimer ancien reçu si existant
    if (user.recu_url) {
      console.log('[PAIEMENT] Suppression ancien recu:', user.recu_url);
      await deleteFromStorage(supabase, user.recu_url);
    }

    // Upload vers Supabase Storage
    const recuUrl = await uploadToStorage(
      supabase, req.file.buffer, req.file.originalname, req.file.mimetype
    );

    if (!recuUrl) {
      console.error('[PAIEMENT] Upload Storage échoué pour userId:', userId);
      return res.send(pagePaiement('Erreur lors de l\'upload du recu. Reessaie.', null));
    }

    console.log('[PAIEMENT] Recu uploadé:', recuUrl);

    const { error: updateErr } = await supabase
      .from('users')
      .update({ recu_url: recuUrl, statut: 'paiement_en_attente', paye: false })
      .eq('id', userId);

    if (updateErr) {
      console.error('[PAIEMENT] Erreur update DB:', updateErr.message);
      return res.send(pagePaiement('Erreur lors de la sauvegarde. Reessaie.', null));
    }

    console.log('[PAIEMENT] DB mise à jour OK pour userId:', userId);
    await logAction(supabase, userId, 'paiement_soumis', user.prenom + ' ' + user.nom, req.ip);

    const waText = [
      '🇳🇪 *PAIEMENT — Bac Tools Niger 2026*', '',
      '*' + user.prenom + ' ' + user.nom + '*',
      'Tel: ' + user.telephone,
      'Ecole: ' + (user.ecole || '-'),
      'Serie: ' + (user.serie || '-'),
      'Ville: ' + (user.ville || '-'),
      'Montant: 3 000 FCFA | Recu uploade ✅', '',
      'Voir panel admin pour valider.'
    ].join('\n');

    const waLink = 'https://wa.me/' + WHATSAPP_NUM + '?text=' + encodeURIComponent(waText);
    return res.send(pageConfirmPaiement(waLink, user));

  } catch(err) {
    console.error('[ERR paiement POST]', err.message);
    res.send(pagePaiement('Erreur serveur inattendue. Reessaie.', null));
  }
});

// ════════════════════════════════════════════════════════════
// STATUT PAIEMENT — suivi en temps réel pour l'élève
// ════════════════════════════════════════════════════════════
router.get('/statut-paiement', async function(req, res) {
  try {
    // Session complète (code validé) → OK
    const sessionId = req.session.userId || null;
    // Session temporaire (juste inscrit, pas de code encore)
    const pendingId = req.session.pendingUserId || null;

    const lookupId = sessionId || pendingId;
    if (!lookupId) return res.redirect('/connexion');

    const { data: user, error } = await supabase
      .from('users').select('id, prenom, nom, statut, paye, recu_url, telephone')
      .eq('id', lookupId).maybeSingle();

    if (error) console.error('[STATUT] Erreur:', error.message);
    if (!user) { req.session.destroy(); return res.redirect('/inscription'); }

    // Si validé : rediriger vers /connexion pour que l'élève entre son code
    // Même si session.userId existe déjà — on force le code
    if (user.paye && user.statut === 'valide') {
      // Détruire toute session temporaire — l'élève doit se connecter proprement
      req.session.pendingUserId = null;
      if (!sessionId) {
        // Pas encore de session complète → obliger la saisie du code
        return res.redirect('/connexion');
      }
      // Session complète existante → dashboard OK (déjà authentifié avec code)
      return res.redirect('/dashboard');
    }

    res.send(pageStatutPaiement(user));
  } catch(err) {
    console.error('[ERR GET statut-paiement]', err.message);
    res.redirect('/connexion');
  }
});

// ════════════════════════════════════════════════════════════
// CONNEXION
// ════════════════════════════════════════════════════════════
router.get('/connexion', async function(req, res) {
  try {
    if (req.session.adminAuth) return res.redirect('/admin');
    if (req.session.userId) {
      const { data: u } = await supabase
        .from('users').select('paye,statut,actif').eq('id', req.session.userId).maybeSingle();
      if (u && u.actif && u.paye && u.statut === 'valide') {
        return res.redirect('/dashboard');
      }
    }
    res.send(pageConnexion(null));
  } catch(err) {
    console.error('[ERR GET connexion]', err.message);
    res.send(pageConnexion(null));
  }
});

router.post('/connexion', async function(req, res) {
  const telephone = cleanPhone(req.body.telephone);
  const codeSaisi = (req.body.code || '').trim();

  if (!telephone || !codeSaisi) {
    return res.send(pageConnexion('Entre ton numero et ton code d\'acces.'));
  }

  try {
    // ── CAS 1 : SUPERADMIN via env ──
    if (telephone === ADMIN_PHONE && verifyAdminCode(codeSaisi)) {
      req.session.adminAuth    = true;
      req.session.adminTel     = ADMIN_PHONE;
      req.session.isSuperAdmin = true;
      logAction(supabase, null, 'connexion_superadmin', telephone, req.ip).catch(() => {});
      return res.redirect('/admin');
    }

    // ── CAS 2 : Vérification DB ──
    const { data: user, error: dbErr } = await supabase
      .from('users').select('*').eq('telephone', telephone).maybeSingle();

    if (dbErr) {
      console.error('[CONNEXION] Erreur DB:', dbErr.message);
      return res.send(pageConnexion('Erreur serveur. Reessaie.'));
    }
    if (!user) {
      return res.send(pageConnexion('Numero non trouve. Inscris-toi d\'abord.'));
    }
    if (!user.actif) {
      return res.send(pageConnexion('Compte desactive. Contacte l\'administrateur.'));
    }

    // ── Admin DB ──
    if (user.role === 'admin' || user.role === 'superadmin') {
      if (!user.code_acces) {
        return res.send(pageConnexion('Code admin non configure. Contacte le support.'));
      }
      if (codeSaisi.toUpperCase() !== user.code_acces.toUpperCase()) {
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

    // ── Elève ──
    if (user.statut === 'inscrit') {
      return res.send(pageConnexion('Tu dois d\'abord soumettre ton recu de paiement.'));
    }
    if (user.statut === 'paiement_en_attente') {
      return res.send(pageConnexion('Paiement en cours de validation. Patiente (2-12h).'));
    }
    if (user.statut === 'rejete') {
      return res.send(pageConnexion('Ton paiement a ete rejete. Contacte le support WhatsApp.'));
    }
    if (!user.paye || !user.code_acces) {
      return res.send(pageConnexion('Compte pas encore active. Patiente.'));
    }
    if (codeSaisi.toUpperCase() !== user.code_acces.toUpperCase()) {
      await logAction(supabase, user.id, 'echec_connexion', telephone, req.ip);
      return res.send(pageConnexion('Code incorrect. Verifie le code recu.'));
    }

    req.session.userId        = user.id;
    req.session.userRole       = user.role;
    req.session.pendingUserId  = null; // nettoyer la session temporaire
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

function pagePaiement(errMsg, user) {
  const prenom = user ? sanitize(user.prenom) : '';
  const hasSession = !!user;
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
    ${prenom ? `<p style="color:rgba(255,255,255,0.6);font-size:13px;margin-top:4px;">Bonjour <strong style="color:white;">${prenom}</strong> 👋</p>` : ''}
  </div>
  ${errMsg ? `<div class="err">❌ ${sanitize(errMsg)}</div>` : ''}

  <div class="step">
    <div class="srow"><div class="snum">1</div>
      <div style="width:100%;">
        <div class="ht" style="font-weight:700;font-size:14px;color:white;margin-bottom:4px;">Envoie 3 000 FCFA sur ce numero</div>
        <div class="numbox">+227 81 50 01 71</div>
        <div style="font-size:11px;color:rgba(255,255,255,0.4);">Airtel Money · Moov Money · Orange Money</div>
      </div>
    </div>
  </div>

  <div class="step">
    <div class="srow"><div class="snum">2</div>
      <div>
        <div class="ht" style="font-weight:700;font-size:14px;color:white;margin-bottom:4px;">Fais une capture du recu</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:4px;line-height:1.5;">Photo de la confirmation de la transaction sur ton telephone.</div>
      </div>
    </div>
  </div>

  <div class="step" style="border-color:rgba(255,117,24,0.25);background:rgba(255,117,24,0.04);">
    <div class="srow"><div class="snum">3</div>
      <div style="width:100%;">
        <div class="ht" style="font-weight:700;font-size:14px;color:white;margin-bottom:12px;">Envoie ton recu ici</div>
        <form method="POST" action="/paiement" enctype="multipart/form-data">
          ${!hasSession ? `
          <div style="margin-bottom:12px;">
            <label class="label">Ton numero de telephone *</label>
            <input class="inp" type="tel" name="telephone" placeholder="Ex: 90 12 34 56" required inputmode="numeric" maxlength="12">
            <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:3px;">Le meme numero utilise lors de l'inscription</div>
          </div>` : ''}
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

function pageConfirmPaiement(waLink, user) {
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
    ${user ? `Merci <strong style="color:white;">${sanitize(user.prenom)}</strong> !<br>` : ''}
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
  <a href="/statut-paiement" class="btn-ghost" style="margin-bottom:12px;">📊 Suivre mon statut</a>
  <a href="${sanitize(waLink)}" class="wa" target="_blank" rel="noopener noreferrer">📲 Support WhatsApp</a>
  <a href="/connexion" class="btn-ghost" style="margin-top:8px;">🔑 J'ai deja mon code</a>
  <p style="margin-top:14px;font-size:11px;color:rgba(255,255,255,0.2);">Support : +227 81 50 01 71</p>
</div>
</body></html>`;
}

function pageStatutPaiement(user) {
  const statutConfig = {
    'inscrit':              { icon:'📝', label:'Inscrit',               color:'#60A5FA', desc:'Tu t\'es inscrit mais n\'as pas encore soumis ton recu.' },
    'paiement_en_attente':  { icon:'⏳', label:'En attente de validation', color:'#FBBF24', desc:'Ton recu a ete recu. L\'admin va valider ton paiement sous 2-12h.' },
    'valide':               { icon:'✅', label:'Paiement valide',        color:'#34D399', desc:'Ton paiement est valide ! Utilise ton code pour te connecter.' },
    'rejete':               { icon:'❌', label:'Paiement rejete',        color:'#F87171', desc:'Ton paiement a ete rejete. Contacte le support.' }
  };
  const st = statutConfig[user.statut] || statutConfig['inscrit'];

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#080D1A">
<title>Statut — Bac Tools Niger 2026</title>
${CSS}
<style>
body{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;padding-top:25px;}
.wrap{max-width:400px;width:100%;z-index:1;}
</style>
</head><body>
<div class="flag"></div>
${STARS_JS}
<div class="wrap fadeUp">
  <div style="text-align:center;margin-bottom:22px;">
    <div style="font-size:3rem;margin:12px 0 8px;">${st.icon}</div>
    <h1 class="ht" style="font-size:1.4rem;font-weight:800;color:${st.color};">${st.label}</h1>
    <p style="color:rgba(255,255,255,0.5);font-size:13px;margin-top:6px;line-height:1.6;">${st.desc}</p>
  </div>
  <div class="card" style="padding:18px;margin-bottom:16px;">
    <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:10px;font-family:'Syne',sans-serif;font-weight:700;">TON COMPTE</div>
    <div style="font-size:14px;color:white;font-weight:700;">${sanitize(user.prenom)} ${sanitize(user.nom)}</div>
    <div style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:3px;">${sanitize(user.telephone)}</div>
    <div style="margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,0.07);">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:10px;height:10px;border-radius:50%;background:${st.color};flex-shrink:0;"></div>
        <span style="font-size:13px;color:${st.color};font-family:'Syne',sans-serif;font-weight:700;">${st.label}</span>
      </div>
    </div>
  </div>
  ${user.statut === 'inscrit' ? `<a href="/paiement" class="btn-orange" style="margin-bottom:12px;">💳 Soumettre mon recu</a>` : ''}
  ${user.statut === 'valide'  ? `<a href="/connexion" class="btn-orange" style="margin-bottom:12px;">🔑 Me connecter</a>` : ''}
  <a href="https://wa.me/22781500171" target="_blank" class="btn-ghost">📲 Support WhatsApp</a>
  <p style="text-align:center;margin-top:12px;font-size:11px;color:rgba(255,255,255,0.2);">Cette page se rafraichit toutes les 30 secondes</p>
</div>
<script>setTimeout(function(){ location.reload(); }, 30000);</script>
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
    <p style="font-size:12px;color:rgba(255,255,255,0.3);">
      Recu envoye ? <a href="/statut-paiement" style="color:#FBBF24;text-decoration:none;font-weight:700;">Voir mon statut</a>
    </p>
    <p style="font-size:12px;color:rgba(255,255,255,0.2);">
      Probleme ? <a href="https://wa.me/22781500171" target="_blank" style="color:#25D366;text-decoration:none;font-weight:700;">Support WhatsApp</a>
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
