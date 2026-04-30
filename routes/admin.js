'use strict';

const express  = require('express');
const router   = express.Router();
const supabase = require('../db/supabase');
const { CSS }  = require('../utils/styles');
const { requireAdmin }  = require('../middlewares/auth');
const { sanitize, genCode, logAction, deleteFromStorage } = require('../utils/helpers');

const WHATSAPP_NUM = '22781500171';

router.use(requireAdmin);

// ════════════════════════════════════════════════════════════
// GET /admin — Dashboard principal
// ════════════════════════════════════════════════════════════
router.get('/', async function(req, res) {
  try {
    const [
      { data: users, error: usersErr },
      { count: msgCount },
      { data: clicks },
      { data: logs }
    ] = await Promise.all([
      supabase.from('users').select('*').order('inscrit_le', { ascending: false }),
      supabase.from('messages').select('*', { count:'exact', head:true }).eq('supprime', false),
      supabase.from('tool_clicks').select('tool_nom').limit(2000),
      supabase.from('logs').select('*').order('cree_le', { ascending: false }).limit(25)
    ]);

    if (usersErr) console.error('[ADMIN] Erreur fetch users:', usersErr.message);

    const allUsers  = users || [];
    const paidCount = allUsers.filter(function(u){ return u.paye; }).length;
    // CORRECTION : filtre sur statut "paiement_en_attente" (pas juste recu_url)
    const pendCount = allUsers.filter(function(u){ return u.statut === 'paiement_en_attente'; }).length;
    const clickMap  = {};
    (clicks || []).forEach(function(c){ clickMap[c.tool_nom] = (clickMap[c.tool_nom]||0)+1; });
    const topOutils = Object.entries(clickMap).sort(function(a,b){return b[1]-a[1];}).slice(0,6);

    console.log('[ADMIN] Users chargés:', allUsers.length, '| En attente:', pendCount);

    res.send(renderAdmin({
      users: allUsers, msgCount: msgCount||0,
      paidCount, pendCount, topOutils,
      logs: logs||[], generated: null, tab: req.query.tab||'users',
      flash: req.query.flash || null, flashErr: req.query.err || null
    }));
  } catch(err) {
    console.error('[ERR admin]', err.message);
    res.status(500).send('<p style="color:red;padding:20px;font-family:sans-serif;">Erreur admin: ' + sanitize(err.message) + '</p>');
  }
});

// ════════════════════════════════════════════════════════════
// POST /admin/valider/:id — VALIDER un paiement (par ID)
// Génère le code, met statut=valide, paye=true
// ════════════════════════════════════════════════════════════
router.post('/valider/:id', async function(req, res) {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) return res.redirect('/admin?err=badid');

  try {
    // Récupérer l'utilisateur
    const { data: user, error: fetchErr } = await supabase
      .from('users').select('*').eq('id', userId).maybeSingle();

    if (fetchErr) {
      console.error('[ADMIN VALIDER] Fetch error:', fetchErr.message);
      return res.redirect('/admin?err=fetcherr');
    }
    if (!user) return res.redirect('/admin?err=notfound');

    // SECURITE : si un code existe déjà, on le réutilise — jamais de régénération
    let code = user.code_acces || null;
    if (!code) {
      // Aucun code existant → générer un code unique
      code = genCode(8);
      for (let i = 0; i < 5; i++) {
        const { data: dup } = await supabase
          .from('users').select('id').eq('code_acces', code).maybeSingle();
        if (!dup) break;
        code = genCode(8);
      }
    }

    // Mettre à jour : statut valide + paye + code (code inchangé si déjà existant)
    const { error: updateErr } = await supabase
      .from('users')
      .update({
        code_acces:      code,
        paye:            true,
        actif:           true,
        statut:          'valide',
        date_validation: new Date().toISOString()
      })
      .eq('id', userId);

    if (updateErr) {
      console.error('[ADMIN VALIDER] Update error:', updateErr.message);
      return res.redirect('/admin?err=updateerr');
    }

    console.log('[ADMIN VALIDER] userId:', userId, '| code:', code);
    await logAction(supabase, userId, 'paiement_valide', user.telephone + ' → code: ' + code, req.ip);

    // Construire lien WhatsApp
    const waText = [
      '🇳🇪 *BAC TOOLS NIGER 2026 — CODE D\'ACCES*','',
      'Bonjour *' + user.prenom + ' ' + user.nom + '* ! 🎉','',
      'Ton paiement a ete valide ✅','',
      '🔑 *Ton code d\'acces :*',
      code,'',
      '📱 *Comment te connecter :*',
      '1. Va sur le site',
      '2. Clique "Me connecter"',
      '3. Entre ton numero : *' + user.telephone + '*',
      '4. Entre le code : *' + code + '*','',
      '🚀 Bonne chance pour le BAC 2026 ! 🏆',
      '— Equipe Bac Tools Niger'
    ].join('\n');

    const rawTel = (user.telephone||'').replace(/\D/g,'');
    const normalizedTel = rawTel.startsWith('227') ? rawTel : '227' + rawTel;
    const waLink = 'https://wa.me/' + normalizedTel + '?text=' + encodeURIComponent(waText);

    // Recharger toutes les données pour le rendu
    const [{ data: users }, { count: msgCount }, { data: clicks }, { data: logs }] = await Promise.all([
      supabase.from('users').select('*').order('inscrit_le', { ascending: false }),
      supabase.from('messages').select('*', { count:'exact', head:true }).eq('supprime', false),
      supabase.from('tool_clicks').select('tool_nom').limit(2000),
      supabase.from('logs').select('*').order('cree_le', { ascending: false }).limit(25)
    ]);
    const allUsers  = users || [];
    const paidCount = allUsers.filter(function(u){ return u.paye; }).length;
    const pendCount = allUsers.filter(function(u){ return u.statut === 'paiement_en_attente'; }).length;
    const clickMap  = {};
    (clicks||[]).forEach(function(c){ clickMap[c.tool_nom]=(clickMap[c.tool_nom]||0)+1; });
    const topOutils = Object.entries(clickMap).sort(function(a,b){return b[1]-a[1];}).slice(0,6);

    res.send(renderAdmin({
      users: allUsers, msgCount: msgCount||0,
      paidCount, pendCount, topOutils,
      logs: logs||[], tab:'pending',
      flash: null, flashErr: null,
      generated: { user: Object.assign({}, user, { code_acces: code }), code, waLink }
    }));
  } catch(err) {
    console.error('[ERR admin valider]', err.message);
    res.redirect('/admin?err=crash');
  }
});

// ════════════════════════════════════════════════════════════
// POST /admin/rejeter/:id — REJETER un paiement
// ════════════════════════════════════════════════════════════
router.post('/rejeter/:id', async function(req, res) {
  const userId = parseInt(req.params.id, 10);
  if (isNaN(userId)) return res.redirect('/admin?err=badid');

  try {
    const { data: user, error: fetchErr } = await supabase
      .from('users').select('*').eq('id', userId).maybeSingle();

    if (fetchErr || !user) return res.redirect('/admin?err=notfound');

    const { error: updateErr } = await supabase
      .from('users')
      .update({ statut: 'rejete', paye: false })
      .eq('id', userId);

    if (updateErr) {
      console.error('[ADMIN REJETER] Error:', updateErr.message);
      return res.redirect('/admin?err=updateerr');
    }

    console.log('[ADMIN REJETER] userId:', userId);
    await logAction(supabase, userId, 'paiement_rejete', user.telephone, req.ip);

    res.redirect('/admin?flash=rejete');
  } catch(err) {
    console.error('[ERR admin rejeter]', err.message);
    res.redirect('/admin?err=crash');
  }
});

// ════════════════════════════════════════════════════════════
// POST /admin/gen-code — Générer code par téléphone (fallback)
// ════════════════════════════════════════════════════════════
router.post('/gen-code', async function(req, res) {
  try {
    const tel = (req.body.telephone || '').replace(/[\s\-\+\.]/g,'');
    if (!tel) return res.redirect('/admin?tab=code&err=notel');

    const { data: user, error: fetchErr } = await supabase
      .from('users').select('*').eq('telephone', tel).maybeSingle();

    if (fetchErr) {
      console.error('[ADMIN GEN-CODE] Fetch error:', fetchErr.message);
      return res.redirect('/admin?tab=code&err=fetcherr');
    }
    if (!user) return res.redirect('/admin?tab=code&err=notfound');

    // SECURITE : si un code existe déjà, on le réutilise — jamais de régénération
    let code = user.code_acces || null;
    if (!code) {
      code = genCode(8);
    }

    const { error: updateErr } = await supabase
      .from('users')
      .update({
        code_acces:      code,
        paye:            true,
        actif:           true,
        statut:          'valide',
        date_validation: new Date().toISOString()
      })
      .eq('id', user.id);

    if (updateErr) {
      console.error('[ADMIN GEN-CODE] Update error:', updateErr.message);
      return res.redirect('/admin?tab=code&err=updateerr');
    }

    await logAction(supabase, user.id, 'code_genere', tel + ' → ' + code, req.ip);

    const waText = [
      '🇳🇪 *BAC TOOLS NIGER 2026 — CODE D\'ACCES*','',
      'Bonjour *' + user.prenom + ' ' + user.nom + '* ! 🎉','',
      'Ton paiement a ete valide ✅','',
      '🔑 *Ton code d\'acces :*',
      code,'',
      '📱 *Comment te connecter :*',
      '1. Va sur le site',
      '2. Clique "Me connecter"',
      '3. Entre ton numero : *' + user.telephone + '*',
      '4. Entre le code : *' + code + '*','',
      '🚀 Bonne chance pour le BAC 2026 ! 🏆',
      '— Equipe Bac Tools Niger'
    ].join('\n');

    const rawTel = (user.telephone||'').replace(/\D/g,'');
    const normalizedTel = rawTel.startsWith('227') ? rawTel : '227' + rawTel;
    const waLink = 'https://wa.me/' + normalizedTel + '?text=' + encodeURIComponent(waText);

    const [{ data: users }, { count: msgCount }, { data: clicks }, { data: logs }] = await Promise.all([
      supabase.from('users').select('*').order('inscrit_le', { ascending: false }),
      supabase.from('messages').select('*', { count:'exact', head:true }).eq('supprime', false),
      supabase.from('tool_clicks').select('tool_nom').limit(2000),
      supabase.from('logs').select('*').order('cree_le', { ascending: false }).limit(25)
    ]);
    const allUsers  = users || [];
    const paidCount = allUsers.filter(function(u){ return u.paye; }).length;
    const pendCount = allUsers.filter(function(u){ return u.statut === 'paiement_en_attente'; }).length;
    const clickMap  = {};
    (clicks||[]).forEach(function(c){ clickMap[c.tool_nom]=(clickMap[c.tool_nom]||0)+1; });
    const topOutils = Object.entries(clickMap).sort(function(a,b){return b[1]-a[1];}).slice(0,6);

    res.send(renderAdmin({
      users: allUsers, msgCount: msgCount||0,
      paidCount, pendCount, topOutils,
      logs: logs||[], tab:'code',
      flash: null, flashErr: null,
      generated: { user: Object.assign({}, user, { code_acces: code }), code, waLink }
    }));
  } catch(err) {
    console.error('[ERR gen-code]', err.message);
    res.redirect('/admin?tab=code&err=gencode');
  }
});

// ── Toggle paye ──
router.post('/toggle-paid/:id', async function(req, res) {
  try {
    const { data: u, error } = await supabase
      .from('users').select('paye,statut').eq('id', req.params.id).maybeSingle();
    if (error) console.error('[TOGGLE PAID]', error.message);
    if (u) {
      const newPaye   = !u.paye;
      const newStatut = newPaye ? 'valide' : 'inscrit';
      await supabase.from('users').update({ paye: newPaye, statut: newStatut }).eq('id', req.params.id);
    }
    res.redirect('/admin');
  } catch(e) { console.error('[TOGGLE PAID]', e.message); res.redirect('/admin'); }
});

// ── Toggle actif ──
router.post('/toggle-actif/:id', async function(req, res) {
  try {
    const { data: u, error } = await supabase
      .from('users').select('actif').eq('id', req.params.id).maybeSingle();
    if (error) console.error('[TOGGLE ACTIF]', error.message);
    if (u) await supabase.from('users').update({ actif: !u.actif }).eq('id', req.params.id);
    res.redirect('/admin');
  } catch(e) { console.error('[TOGGLE ACTIF]', e.message); res.redirect('/admin'); }
});

// ── Supprimer utilisateur + reçu Storage ──
router.post('/delete-user/:id', async function(req, res) {
  try {
    const { data: u } = await supabase
      .from('users').select('recu_url').eq('id', req.params.id).maybeSingle();
    if (u && u.recu_url) {
      await deleteFromStorage(supabase, u.recu_url);
    }
    await supabase.from('tool_clicks').delete().eq('user_id', req.params.id);
    await supabase.from('messages').delete().eq('user_id', req.params.id);
    await supabase.from('users').delete().eq('id', req.params.id);
    res.redirect('/admin');
  } catch(e) { console.error('[DELETE USER]', e.message); res.redirect('/admin'); }
});

// ── Voir reçu — visionneuse HTML inline (v7.6) ──
router.get('/recu/:id', async function(req, res) {
  try {
    const userId = parseInt(req.params.id, 10);
    if (isNaN(userId)) return res.status(400).send('ID invalide');

    const { data: u, error } = await supabase
      .from('users').select('id,prenom,nom,telephone,recu_url').eq('id', userId).maybeSingle();

    if (error) {
      console.error('[ADMIN RECU] Fetch error:', error.message);
      return res.status(500).send('Erreur base de donnees');
    }

    const recuUrl   = u && u.recu_url ? u.recu_url : null;
    const prenom    = u ? sanitize(u.prenom  || '') : '—';
    const nom       = u ? sanitize(u.nom     || '') : '—';
    const telephone = u ? sanitize(u.telephone || '') : '—';

    // Détection du type de fichier
    let mediaBlock = '';
    if (!recuUrl) {
      mediaBlock = `<div style="text-align:center;padding:40px 20px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;">
        <div style="font-size:3rem;margin-bottom:12px;">📭</div>
        <p style="color:rgba(255,255,255,0.45);font-size:14px;">Aucun recu soumis pour cet utilisateur.</p>
      </div>`;
    } else {
      const urlLower = recuUrl.toLowerCase().split('?')[0];
      const isPdf    = urlLower.endsWith('.pdf');
      const isImage  = /\.(jpg|jpeg|png|gif|webp)$/.test(urlLower);
      if (isPdf) {
        mediaBlock = `<iframe src="${recuUrl}" style="width:100%;height:80vh;border:none;border-radius:12px;background:#111;" title="Recu PDF"></iframe>`;
      } else if (isImage) {
        mediaBlock = `<div style="text-align:center;"><img src="${recuUrl}" alt="Recu de paiement" style="max-width:100%;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.5);"></div>`;
      } else {
        // Format inconnu — lien de téléchargement sécurisé
        mediaBlock = `<div style="text-align:center;padding:30px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:14px;">
          <div style="font-size:2.5rem;margin-bottom:12px;">📎</div>
          <p style="color:rgba(255,255,255,0.5);font-size:13px;margin-bottom:14px;">Format de fichier non previewable.</p>
          <a href="${recuUrl}" target="_blank" rel="noopener noreferrer" style="background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.35);color:#93c5fd;padding:10px 18px;border-radius:10px;font-family:'Syne',sans-serif;font-size:13px;font-weight:700;text-decoration:none;">⬇️ Ouvrir le fichier</a>
        </div>`;
      }
    }

    // Boutons d'action en bas (uniquement si l'utilisateur existe)
    // Note : on échappe les apostrophes pour éviter de casser le confirm() JS
    const prenomJs = prenom.replace(/'/g, "\\'");
    const nomJs    = nom.replace(/'/g, "\\'");
    const actionButtons = u ? `
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px;">
        <form method="POST" action="/admin/valider/${u.id}" style="display:inline;">
          <button type="submit" style="background:linear-gradient(135deg,rgba(34,197,94,0.2),rgba(34,197,94,0.1));border:1px solid rgba(34,197,94,0.4);color:#86efac;padding:12px 20px;border-radius:11px;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;cursor:pointer;">
            ✅ Valider le paiement
          </button>
        </form>
        <form method="POST" action="/admin/rejeter/${u.id}" style="display:inline;" onsubmit="return confirm('Rejeter le paiement de ${prenomJs} ${nomJs} ?');">
          <button type="submit" style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);color:#fca5a5;padding:12px 20px;border-radius:11px;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;cursor:pointer;">
            ❌ Rejeter
          </button>
        </form>
      </div>` : '';

    res.send(`<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="theme-color" content="#060A14">
<title>Recu — ${prenom} ${nom}</title>
${CSS}
<style>
body{background:#060A14;min-height:100vh;padding-top:5px;}
</style>
</head><body>
<div class="flag"></div>

<header style="position:sticky;top:5px;z-index:50;padding:11px 16px;display:flex;align-items:center;justify-content:space-between;background:rgba(6,10,20,0.99);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(16px);">
  <div style="display:flex;align-items:center;gap:10px;">
    <span style="font-size:1.3rem;">🇳🇪</span>
    <div>
      <div class="ht" style="font-size:13px;font-weight:800;color:white;line-height:1.1;">Visionneuse Recu</div>
      <div class="mono" style="font-size:9px;color:#FF7518;">Panel Admin · v7.6</div>
    </div>
  </div>
  <button onclick="history.back()" style="background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.7);padding:8px 14px;border-radius:10px;font-family:'Syne',sans-serif;font-size:12px;font-weight:700;cursor:pointer;">
    ← Retour admin
  </button>
</header>

<div style="max-width:760px;margin:0 auto;padding:20px 16px;">

  <!-- Infos élève -->
  <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px 18px;margin-bottom:18px;display:flex;align-items:center;gap:14px;">
    <div style="width:44px;height:44px;background:linear-gradient(135deg,#FF7518,#FF4500);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:16px;color:white;flex-shrink:0;">
      ${prenom && prenom !== '—' ? prenom[0].toUpperCase() : 'E'}
    </div>
    <div>
      <div class="ht" style="font-size:15px;font-weight:800;color:white;">${prenom} ${nom}</div>
      <div class="mono" style="font-size:12px;color:rgba(255,255,255,0.4);margin-top:2px;">📞 ${telephone}</div>
    </div>
    <div style="margin-left:auto;">
      <span style="font-size:10px;color:#FBBF24;background:rgba(234,179,8,0.1);border:1px solid rgba(234,179,8,0.25);padding:4px 10px;border-radius:20px;font-family:'Syne',sans-serif;font-weight:700;">⏳ En attente</span>
    </div>
  </div>

  <!-- Visionneuse -->
  <div style="margin-bottom:4px;">
    <div class="ht" style="font-size:12px;color:rgba(255,255,255,0.3);margin-bottom:12px;text-transform:uppercase;letter-spacing:0.08em;">📄 Recu de paiement</div>
    ${mediaBlock}
  </div>

  <!-- Actions -->
  ${actionButtons}

</div>
</body></html>`);
  } catch(e) {
    console.error('[ADMIN RECU] Error:', e.message);
    res.status(500).send('Erreur serveur');
  }
});

// ── Logout admin ──
router.get('/logout', function(req, res) {
  req.session.adminAuth    = false;
  req.session.adminTel     = null;
  req.session.isSuperAdmin = false;
  res.redirect('/');
});

// ════════════════════════════════════════════════════════════
// RENDER ADMIN
// ════════════════════════════════════════════════════════════
function renderAdmin({ users, msgCount, paidCount, pendCount, topOutils, logs, generated, tab, flash, flashErr }) {
  const revenue   = paidCount * 3000;
  const activeTab = tab || 'users';
  const pendingUsers = users.filter(function(u){ return u.statut === 'paiement_en_attente'; });

  // Lignes tableau utilisateurs
  const rows = users.map(function(u) {
    const isPending = u.statut === 'paiement_en_attente';
    const statutColor = {
      'inscrit':             '#60A5FA',
      'paiement_en_attente': '#FBBF24',
      'valide':              '#34D399',
      'rejete':              '#F87171'
    }[u.statut] || 'rgba(255,255,255,0.4)';

    const statutLabel = {
      'inscrit':             '📝 Inscrit',
      'paiement_en_attente': '⏳ En attente',
      'valide':              '✅ Valide',
      'rejete':              '❌ Rejete'
    }[u.statut] || u.statut;

    return `<tr${isPending?' style="background:rgba(234,179,8,0.03);"':''}>
  <td>
    <div class="ht" style="font-size:12px;font-weight:700;color:white;">${sanitize(u.prenom)} ${sanitize(u.nom)}</div>
    <div class="mono" style="font-size:10px;color:rgba(255,255,255,0.35);">${sanitize(u.telephone)}</div>
  </td>
  <td style="font-size:11px;color:rgba(255,255,255,0.5);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sanitize(u.ecole||'—')}</td>
  <td style="font-size:11px;color:rgba(255,255,255,0.5);white-space:nowrap;">${sanitize(u.serie||'—')}</td>
  <td><span style="font-size:10px;color:${statutColor};font-family:'Syne',sans-serif;font-weight:700;">${statutLabel}</span></td>
  <td>${u.code_acces
    ? `<span class="mono" style="font-size:11px;color:#FF7518;background:rgba(255,117,24,0.1);padding:3px 8px;border-radius:6px;">${sanitize(u.code_acces)}</span>`
    : '<span style="color:rgba(255,255,255,0.2);font-size:11px;">—</span>'
  }</td>
  <td><span style="font-size:11px;color:${u.actif?'#86efac':'#fca5a5'};">${u.actif?'🟢':'🔴'}</span></td>
  <td>
    <div style="display:flex;gap:5px;flex-wrap:wrap;">
      ${u.recu_url ? `<a href="/admin/recu/${u.id}" target="_blank" class="abtn" style="background:rgba(59,130,246,0.1);border-color:rgba(59,130,246,0.25);color:#93c5fd;">📄 Recu</a>` : ''}
      ${isPending ? `
        <form method="POST" action="/admin/valider/${u.id}" style="display:inline;">
          <button class="abtn" style="background:rgba(34,197,94,0.12);border-color:rgba(34,197,94,0.3);color:#86efac;">✅ Valider</button>
        </form>
        <form method="POST" action="/admin/rejeter/${u.id}" style="display:inline;" onsubmit="return confirm('Rejeter le paiement de ${sanitize(u.prenom)} ?');">
          <button class="abtn" style="background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.25);color:#fca5a5;">❌ Rejeter</button>
        </form>
      ` : ''}
      <form method="POST" action="/admin/toggle-actif/${u.id}" style="display:inline;">
        <button class="abtn" style="background:${u.actif?'rgba(220,38,38,0.1)':'rgba(34,197,94,0.1)'};border-color:${u.actif?'rgba(220,38,38,0.25)':'rgba(34,197,94,0.25)'};color:${u.actif?'#fca5a5':'#86efac'};">${u.actif?'🔒 Bloquer':'🔓 Activer'}</button>
      </form>
      <form method="POST" action="/admin/delete-user/${u.id}" style="display:inline;" onsubmit="return confirm('Supprimer ${sanitize(u.prenom)} ${sanitize(u.nom)} ?');">
        <button class="abtn" style="background:rgba(220,38,38,0.1);border-color:rgba(220,38,38,0.2);color:#fca5a5;">🗑</button>
      </form>
    </div>
  </td>
</tr>`;
  }).join('');

  const statsCards = [
    { ic:'👥', lb:'Inscrits',   val: users.length,                        cl:'#60A5FA' },
    { ic:'💳', lb:'Payes',      val: paidCount,                            cl:'#34D399' },
    { ic:'⏳', lb:'En attente', val: pendCount,                            cl:'#FBBF24' },
    { ic:'💬', lb:'Messages',   val: msgCount,                             cl:'#F472B6' },
    { ic:'💰', lb:'Revenus',    val: revenue.toLocaleString('fr-FR')+' F', cl:'#FB923C' },
    { ic:'🔥', lb:'Top outil',  val: topOutils[0]?topOutils[0][0]:'—',    cl:'#A78BFA' }
  ].map(function(s) {
    return `<div class="stat-card"><div style="font-size:1.1rem;margin-bottom:4px;">${s.ic}</div><div class="mono" style="font-size:1rem;font-weight:700;color:${s.cl};word-break:break-all;">${s.val}</div><div style="font-size:10px;color:rgba(255,255,255,0.3);font-family:'Syne',sans-serif;font-weight:600;margin-top:2px;">${s.lb}</div></div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<meta name="theme-color" content="#060A14">
<title>Admin — Bac Tools Niger 2026</title>
${CSS}
<style>
body{background:#060A14;padding-top:5px;min-height:100vh;}
.abtn{font-size:10px;padding:4px 9px;border-radius:7px;font-family:'Syne',sans-serif;font-weight:700;cursor:pointer;transition:opacity 0.18s;white-space:nowrap;border:1px solid;background:transparent;color:white;}
.abtn:hover{opacity:0.75;}
.stat-card{background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:14px;padding:15px;}
table{width:100%;border-collapse:collapse;}
th{padding:9px 12px;font-size:10px;color:rgba(255,255,255,0.3);font-family:'Syne',sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;border-bottom:1px solid rgba(255,255,255,0.06);text-align:left;white-space:nowrap;}
td{padding:9px 12px;border-bottom:1px solid rgba(255,255,255,0.04);vertical-align:middle;}
tr:hover td{background:rgba(255,255,255,0.012);}
.tab-btn{padding:8px 15px;border-radius:10px;font-family:'Syne',sans-serif;font-weight:700;font-size:12px;cursor:pointer;transition:all 0.18s;border:1px solid transparent;white-space:nowrap;}
.tab-btn.on{background:rgba(255,117,24,0.14);color:#FF7518;border-color:rgba(255,117,24,0.3);}
.tab-btn:not(.on){background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.45);border-color:rgba(255,255,255,0.07);}
.tab-c{display:none;}.tab-c.on{display:block;}
.minp{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.10);color:white;border-radius:11px;padding:11px 14px;font-size:13px;font-family:'Noto Sans',sans-serif;transition:border-color 0.2s;width:100%;}
.minp:focus{border-color:#FF7518;outline:none;}
.minp::placeholder{color:rgba(255,255,255,0.3);}
.pending-badge{display:inline-flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#F59E0B,#D97706);color:#000;border-radius:100px;min-width:18px;height:18px;font-size:10px;font-weight:800;font-family:'Syne',sans-serif;margin-left:4px;padding:0 4px;}
.code-result{background:rgba(255,117,24,0.06);border:2px solid rgba(255,117,24,0.3);border-radius:16px;padding:20px;margin-bottom:18px;}
.pending-card{background:rgba(234,179,8,0.05);border:1px solid rgba(234,179,8,0.2);border-radius:12px;padding:13px;margin-bottom:9px;}
.flash-ok{background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);color:#86efac;border-radius:10px;padding:10px 14px;font-size:13px;margin-bottom:14px;}
.flash-err{background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.3);color:#fca5a5;border-radius:10px;padding:10px 14px;font-size:13px;margin-bottom:14px;}
</style>
</head><body>
<div class="flag"></div>

<header style="position:sticky;top:5px;z-index:50;padding:11px 16px;display:flex;align-items:center;justify-content:space-between;background:rgba(6,10,20,0.99);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(16px);">
  <div style="display:flex;align-items:center;gap:10px;">
    <span style="font-size:1.3rem;">🇳🇪</span>
    <div>
      <div class="ht" style="font-size:13px;font-weight:800;color:white;line-height:1.1;">Panel Admin</div>
      <div class="mono" style="font-size:9px;color:#FF7518;">Bac Tools Niger 2026 · v7</div>
    </div>
  </div>
  <div style="display:flex;gap:8px;">
    <a href="/apercu" target="_blank" rel="noopener noreferrer" style="background:rgba(41,171,71,0.1);border:1px solid rgba(41,171,71,0.2);color:#86efac;padding:7px 11px;border-radius:9px;font-family:'Syne',sans-serif;font-size:11px;font-weight:700;text-decoration:none;">🌐 Site</a>
    <a href="/admin/logout" style="background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.2);color:#fca5a5;padding:7px 11px;border-radius:9px;font-family:'Syne',sans-serif;font-size:11px;font-weight:700;text-decoration:none;">🚪 Quitter</a>
  </div>
</header>

<div style="max-width:1200px;margin:0 auto;padding:16px;">

  <!-- STATS -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:16px;">
    ${statsCards}
  </div>

  <!-- CODE GENERE -->
  ${generated ? `
  <div class="code-result">
    <div class="ht" style="color:#FF7518;font-weight:800;font-size:15px;margin-bottom:12px;">
      ✅ Code genere pour ${sanitize(generated.user.prenom)} ${sanitize(generated.user.nom)}
    </div>
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap;margin-bottom:14px;">
      <div class="mono" style="font-size:2.2rem;font-weight:700;color:white;letter-spacing:0.15em;background:rgba(0,0,0,0.4);padding:10px 20px;border-radius:12px;">${sanitize(generated.code)}</div>
      <button onclick="navigator.clipboard.writeText('${sanitize(generated.code)}');this.textContent='✅ Copie!';setTimeout(function(){this.textContent='📋 Copier';}.bind(this),2500);"
        style="background:linear-gradient(135deg,#FF7518,#FF4500);color:white;border:none;border-radius:10px;padding:10px 18px;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;cursor:pointer;">
        📋 Copier
      </button>
    </div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;">
      <a href="${sanitize(generated.waLink)}" target="_blank" style="background:linear-gradient(135deg,#25D366,#128C7E);color:white;border:none;border-radius:10px;padding:10px 18px;font-family:'Syne',sans-serif;font-weight:700;font-size:13px;text-decoration:none;display:inline-flex;align-items:center;gap:6px;">📲 Envoyer par WhatsApp</a>
      <span class="mono" style="color:rgba(255,255,255,0.35);font-size:12px;">${sanitize(generated.user.telephone)}</span>
    </div>
  </div>` : ''}

  <!-- FLASH MESSAGES -->
  ${flash ? `<div class="flash-ok">✅ Action effectuee avec succes.</div>` : ''}
  ${flashErr ? `<div class="flash-err">❌ Erreur : ${sanitize(flashErr)}</div>` : ''}

  <!-- ONGLETS -->
  <div style="display:flex;gap:7px;overflow-x:auto;margin-bottom:14px;padding-bottom:2px;scrollbar-width:none;">
    <button class="tab-btn${activeTab==='users'?' on':''}" onclick="showTab('users')">
      👥 Utilisateurs (${users.length})
    </button>
    <button class="tab-btn${activeTab==='pending'?' on':''}" onclick="showTab('pending')">
      ⏳ En attente${pendCount>0?`<span class="pending-badge">${pendCount}</span>`:''}
    </button>
    <button class="tab-btn${activeTab==='code'?' on':''}" onclick="showTab('code')">⚡ Generer code</button>
    <button class="tab-btn${activeTab==='stats'?' on':''}" onclick="showTab('stats')">📊 Stats</button>
    <button class="tab-btn${activeTab==='logs'?' on':''}" onclick="showTab('logs')">📋 Logs</button>
  </div>

  <!-- TAB USERS -->
  <div id="tab-users" class="tab-c${activeTab==='users'?' on':''}">
    <div class="card" style="padding:15px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <h2 class="ht" style="font-size:0.9rem;font-weight:800;color:white;">👥 Tous les utilisateurs</h2>
        <span style="font-size:12px;color:rgba(255,255,255,0.3);">Total: ${users.length}</span>
      </div>
      <input type="search" class="minp" placeholder="🔍 Rechercher nom, telephone, ecole..." oninput="filterUsers(this.value)" style="margin-bottom:13px;">
      <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>Eleve</th><th>Ecole</th><th>Serie</th><th>Statut</th><th>Code</th><th>Actif</th><th>Actions</th></tr></thead>
          <tbody id="usersBody">${rows}</tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- TAB EN ATTENTE -->
  <div id="tab-pending" class="tab-c${activeTab==='pending'?' on':''}">
    <div class="card" style="padding:18px;">
      <div class="ht" style="font-size:13px;font-weight:700;color:#fde047;margin-bottom:16px;">
        ⏳ Paiements en attente de validation (${pendCount})
      </div>
      ${pendingUsers.length === 0
        ? '<p style="color:rgba(255,255,255,0.3);font-size:13px;text-align:center;padding:20px 0;">Aucun paiement en attente 🎉</p>'
        : pendingUsers.map(function(u) {
            return `
      <div class="pending-card">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:10px;">
          <div>
            <div class="ht" style="font-size:14px;font-weight:700;color:white;">${sanitize(u.prenom)} ${sanitize(u.nom)}</div>
            <div class="mono" style="font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;">${sanitize(u.telephone)}</div>
            <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px;">${sanitize(u.ecole)} · ${sanitize(u.serie)} · ${sanitize(u.ville)}</div>
            <div style="font-size:10px;color:rgba(255,255,255,0.2);margin-top:3px;">Inscrit le ${new Date(u.inscrit_le).toLocaleDateString('fr-FR')}</div>
          </div>
          <div style="display:flex;gap:7px;flex-wrap:wrap;align-items:center;">
            ${u.recu_url ? `<a href="/admin/recu/${u.id}" target="_blank" class="abtn" style="background:rgba(59,130,246,0.1);border-color:rgba(59,130,246,0.25);color:#93c5fd;">👁 Voir recu</a>` : '<span style="font-size:11px;color:rgba(255,255,255,0.25);">Pas de recu</span>'}
            <form method="POST" action="/admin/valider/${u.id}" style="display:inline;">
              <button type="submit" class="abtn" style="background:rgba(34,197,94,0.15);border-color:rgba(34,197,94,0.4);color:#86efac;font-size:11px;padding:6px 12px;">✅ Valider + Generer code</button>
            </form>
            <form method="POST" action="/admin/rejeter/${u.id}" style="display:inline;" onsubmit="return confirm('Rejeter le paiement de ${sanitize(u.prenom)} ?');">
              <button type="submit" class="abtn" style="background:rgba(239,68,68,0.12);border-color:rgba(239,68,68,0.3);color:#fca5a5;font-size:11px;padding:6px 12px;">❌ Rejeter</button>
            </form>
          </div>
        </div>
      </div>`;
          }).join('')
      }
    </div>
  </div>

  <!-- TAB GENERER CODE -->
  <div id="tab-code" class="tab-c${activeTab==='code'?' on':''}">
    <div class="card" style="padding:20px;max-width:480px;">
      <h2 class="ht" style="font-size:0.9rem;font-weight:800;color:white;margin-bottom:14px;">⚡ Generer un code par telephone</h2>
      <p style="font-size:13px;color:rgba(255,255,255,0.45);margin-bottom:18px;line-height:1.6;">Utilise l'onglet "En attente" pour valider directement. Ce formulaire est un acces rapide par numero.</p>
      <form method="POST" action="/admin/gen-code">
        <div style="margin-bottom:14px;">
          <label class="label">Numero de telephone de l'eleve</label>
          <input class="minp" type="tel" name="telephone" placeholder="Ex: 90000000" required inputmode="numeric">
        </div>
        <button type="submit" style="background:linear-gradient(135deg,#FF7518,#FF4500);color:white;border:none;border-radius:11px;padding:13px 20px;font-family:'Syne',sans-serif;font-weight:700;cursor:pointer;font-size:13px;width:100%;">
          ⚡ Generer et Activer
        </button>
      </form>
    </div>
  </div>

  <!-- TAB STATS -->
  <div id="tab-stats" class="tab-c${activeTab==='stats'?' on':''}">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px;">
      <div class="card" style="padding:17px;">
        <h3 class="ht" style="font-size:0.85rem;font-weight:800;color:white;margin-bottom:13px;">📊 Statuts</h3>
        ${[
          ['📝 Inscrits',     users.filter(function(u){return u.statut==='inscrit';}).length,             '#60A5FA'],
          ['⏳ En attente',   pendCount,                                                                  '#FBBF24'],
          ['✅ Valides',      users.filter(function(u){return u.statut==='valide';}).length,              '#34D399'],
          ['❌ Rejetes',      users.filter(function(u){return u.statut==='rejete';}).length,              '#F87171']
        ].map(function(r){
          const pct = users.length > 0 ? Math.round(r[1]/users.length*100) : 0;
          return `<div style="margin-bottom:11px;"><div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span style="font-size:12px;color:rgba(255,255,255,0.55);">${r[0]}</span><span class="mono" style="font-size:12px;color:${r[2]};font-weight:700;">${r[1]} (${pct}%)</span></div><div style="height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:${r[2]};border-radius:3px;"></div></div></div>`;
        }).join('')}
        <div style="margin-top:14px;padding-top:13px;border-top:1px solid rgba(255,255,255,0.07);">
          <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-bottom:4px;">REVENUS ESTIMES</div>
          <div class="mono" style="font-size:1.6rem;font-weight:700;color:#FB923C;">${revenue.toLocaleString('fr-FR')} FCFA</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.3);margin-top:2px;">${paidCount} × 3 000 FCFA</div>
        </div>
      </div>
      <div class="card" style="padding:17px;">
        <h3 class="ht" style="font-size:0.85rem;font-weight:800;color:white;margin-bottom:13px;">🔥 Top outils</h3>
        ${topOutils.length > 0
          ? topOutils.map(function(t,i){ return `<div style="display:flex;align-items:center;gap:9px;margin-bottom:9px;"><div class="mono" style="width:22px;font-size:11px;color:${i===0?'#FBBF24':i===1?'#94A3B8':'rgba(255,255,255,0.3)'};font-weight:700;">#${i+1}</div><div style="flex:1;font-size:12px;color:rgba(255,255,255,0.65);">${sanitize(t[0])}</div><div class="mono" style="font-size:12px;color:#FF7518;font-weight:700;">${t[1]}</div></div>`; }).join('')
          : '<p style="color:rgba(255,255,255,0.3);font-size:12px;">Aucun clic</p>'
        }
      </div>
      <div class="card" style="padding:17px;">
        <h3 class="ht" style="font-size:0.85rem;font-weight:800;color:white;margin-bottom:13px;">📚 Series</h3>
        ${['Terminale D','Terminale A','Terminale C','Terminale G2','Autre'].map(function(s){
          const n = users.filter(function(u){return u.serie===s;}).length;
          const pct = users.length>0?Math.round(n/users.length*100):0;
          return n>0?`<div style="margin-bottom:9px;"><div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:12px;color:rgba(255,255,255,0.55);">${s}</span><span class="mono" style="font-size:12px;color:#60A5FA;font-weight:700;">${n}</span></div><div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:#3B82F6;border-radius:2px;"></div></div></div>`:'';}
        ).join('')}
      </div>
    </div>
  </div>

  <!-- TAB LOGS -->
  <div id="tab-logs" class="tab-c${activeTab==='logs'?' on':''}">
    <div class="card" style="padding:15px;">
      <h2 class="ht" style="font-size:0.9rem;font-weight:800;color:white;margin-bottom:13px;">📋 Journal d'activite</h2>
      <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>Action</th><th>Details</th><th>IP</th><th>Date</th></tr></thead>
          <tbody>
            ${logs.map(function(l){ return `<tr>
  <td><span style="font-size:11px;color:${l.action.includes('admin')||l.action.includes('superadmin')?'#FBBF24':l.action.includes('connexion')?'#86efac':l.action.includes('rejete')?'#F87171':'rgba(255,255,255,0.55)'};font-family:'Syne',sans-serif;font-weight:600;">${sanitize(l.action)}</span></td>
  <td style="font-size:11px;color:rgba(255,255,255,0.45);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sanitize(l.details||'—')}</td>
  <td class="mono" style="font-size:10px;color:rgba(255,255,255,0.3);white-space:nowrap;">${sanitize(l.ip||'—')}</td>
  <td style="font-size:10px;color:rgba(255,255,255,0.3);white-space:nowrap;">${new Date(l.cree_le).toLocaleString('fr-FR')}</td>
</tr>`;}).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>

</div>

<script>
function showTab(t){
  document.querySelectorAll('.tab-c').forEach(function(c){c.classList.remove('on');});
  document.querySelectorAll('.tab-btn').forEach(function(b){b.classList.remove('on');});
  document.getElementById('tab-'+t).classList.add('on');
  event.currentTarget.classList.add('on');
}
function filterUsers(q){
  q=q.toLowerCase();
  document.querySelectorAll('#usersBody tr').forEach(function(r){
    r.style.display=(!q||r.innerText.toLowerCase().includes(q))?'':'none';
  });
}
</script>
</body></html>`;
}

module.exports = router;
