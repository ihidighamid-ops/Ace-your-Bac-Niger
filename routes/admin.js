'use strict';

const express  = require('express');
const router   = express.Router();
const path     = require('path');
const fs       = require('fs');
const supabase = require('../db/supabase');
const { CSS }  = require('../utils/styles');
const { requireAdmin }  = require('../middlewares/auth');
const { sanitize, genCode, logAction } = require('../utils/helpers');

const WHATSAPP_NUM = '22781538341';

router.use(requireAdmin);

// ════════════════════════════════════════════════════════════
// GET /admin — Dashboard principal
// ════════════════════════════════════════════════════════════
router.get('/', async function(req, res) {
  try {
    const [
      { data: users },
      { count: msgCount },
      { data: clicks },
      { data: logs }
    ] = await Promise.all([
      supabase.from('users').select('*').order('inscrit_le', { ascending: false }),
      supabase.from('messages').select('*', { count:'exact', head:true }).eq('supprime', false),
      supabase.from('tool_clicks').select('tool_nom').limit(2000),
      supabase.from('logs').select('*').order('cree_le', { ascending: false }).limit(25)
    ]);

    const allUsers   = users || [];
    const paidCount  = allUsers.filter(function(u){ return u.paye; }).length;
    const pendCount  = allUsers.filter(function(u){ return u.recu_url && !u.paye; }).length;
    const clickMap   = {};
    (clicks || []).forEach(function(c){ clickMap[c.tool_nom] = (clickMap[c.tool_nom]||0)+1; });
    const topOutils  = Object.entries(clickMap).sort(function(a,b){return b[1]-a[1];}).slice(0,6);

    res.send(renderAdmin({
      users: allUsers, msgCount: msgCount||0,
      paidCount, pendCount, topOutils,
      logs: logs||[], generated: null, tab: req.query.tab||'users'
    }));
  } catch(err) {
    console.error('[ERR admin]', err.message);
    res.status(500).send('<p style="color:red;padding:20px;font-family:sans-serif;">Erreur admin: ' + sanitize(err.message) + '</p>');
  }
});

// ════════════════════════════════════════════════════════════
// POST /admin/gen-code — générer code + activer compte
// ════════════════════════════════════════════════════════════
router.post('/gen-code', async function(req, res) {
  try {
    const tel = (req.body.telephone || '').replace(/[\s\-\+\.]/g,'');
    if (!tel) return res.redirect('/admin?tab=code&err=notel');

    const { data: user } = await supabase.from('users').select('*').eq('telephone', tel).single();
    if (!user) return res.redirect('/admin?tab=code&err=notfound');

    const code = genCode(8);
    await supabase.from('users')
      .update({ code_acces: code, paye: true, actif: true })
      .eq('id', user.id);

    await logAction(supabase, user.id, 'code_genere', tel + ' → ' + code, req.ip);

    const waText = [
      '🇳🇪 *BAC TOOLS NIGER 2026 — CODE D\'ACCES*','',
      'Bonjour *' + user.prenom + ' ' + user.nom + '* ! 🎉','',
      'Ton paiement a ete valide ✅','',
      '🔑 *Ton code d\'acces :*',
      '`' + code + '`','',
      '📱 *Comment te connecter :*',
      '1. Va sur le site',
      '2. Clique "Me connecter"',
      '3. Entre ton numero : *' + user.telephone + '*',
      '4. Entre le code : *' + code + '*','',
      '🚀 Bonne chance pour le BAC 2026 ! 🏆',
      '— Equipe Bac Tools Niger'
    ].join('\n');

    const waLink = 'https://wa.me/' + (user.telephone||'').replace(/\D/g,'') + '?text=' + encodeURIComponent(waText);

    // Recharger toutes les données
    const [{ data: users }, { count: msgCount }, { data: clicks }, { data: logs }] = await Promise.all([
      supabase.from('users').select('*').order('inscrit_le', { ascending: false }),
      supabase.from('messages').select('*', { count:'exact', head:true }).eq('supprime', false),
      supabase.from('tool_clicks').select('tool_nom').limit(2000),
      supabase.from('logs').select('*').order('cree_le', { ascending: false }).limit(25)
    ]);
    const allUsers  = users || [];
    const paidCount = allUsers.filter(function(u){ return u.paye; }).length;
    const pendCount = allUsers.filter(function(u){ return u.recu_url && !u.paye; }).length;
    const clickMap  = {};
    (clicks||[]).forEach(function(c){ clickMap[c.tool_nom]=(clickMap[c.tool_nom]||0)+1; });
    const topOutils = Object.entries(clickMap).sort(function(a,b){return b[1]-a[1];}).slice(0,6);

    res.send(renderAdmin({
      users: allUsers, msgCount: msgCount||0,
      paidCount, pendCount, topOutils,
      logs: logs||[], tab:'code',
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
    const { data: u } = await supabase.from('users').select('paye').eq('id', req.params.id).single();
    if (u) await supabase.from('users').update({ paye: !u.paye }).eq('id', req.params.id);
    res.redirect('/admin');
  } catch(e) { res.redirect('/admin'); }
});

// ── Toggle actif ──
router.post('/toggle-actif/:id', async function(req, res) {
  try {
    const { data: u } = await supabase.from('users').select('actif').eq('id', req.params.id).single();
    if (u) await supabase.from('users').update({ actif: !u.actif }).eq('id', req.params.id);
    res.redirect('/admin');
  } catch(e) { res.redirect('/admin'); }
});

// ── Supprimer utilisateur ──
router.post('/delete-user/:id', async function(req, res) {
  try {
    await supabase.from('tool_clicks').delete().eq('user_id', req.params.id);
    await supabase.from('messages').delete().eq('user_id', req.params.id);
    await supabase.from('users').delete().eq('id', req.params.id);
    res.redirect('/admin');
  } catch(e) { res.redirect('/admin'); }
});

// ── Voir reçu ──
router.get('/recu/:filename', function(req, res) {
  const filename = path.basename(req.params.filename);
  const f = path.join(__dirname, '../public/recus', filename);
  if (!fs.existsSync(f)) return res.status(404).send('Fichier introuvable');
  res.sendFile(f);
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
function renderAdmin({ users, msgCount, paidCount, pendCount, topOutils, logs, generated, tab }) {
  const revenue = paidCount * 3000;
  const activeTab = tab || 'users';

  const rows = users.map(function(u) {
    const isPending = u.recu_url && !u.paye;
    return `<tr${isPending?' style="background:rgba(234,179,8,0.03);"':''}>
  <td>
    <div class="ht" style="font-size:12px;font-weight:700;color:white;">${sanitize(u.prenom)} ${sanitize(u.nom)}</div>
    <div class="mono" style="font-size:10px;color:rgba(255,255,255,0.35);">${sanitize(u.telephone)}</div>
  </td>
  <td style="font-size:11px;color:rgba(255,255,255,0.5);max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sanitize(u.ecole||'—')}</td>
  <td style="font-size:11px;color:rgba(255,255,255,0.5);white-space:nowrap;">${sanitize(u.serie||'—')}</td>
  <td>${u.paye
    ? '<span class="chip chip-green">✅ Paye</span>'
    : (u.recu_url
      ? '<span class="chip chip-yellow">⏳ Recu</span>'
      : '<span class="chip chip-gray">❌ Non</span>')
  }</td>
  <td>${u.code_acces
    ? `<span class="mono" style="font-size:11px;color:#FF7518;background:rgba(255,117,24,0.1);padding:3px 8px;border-radius:6px;">${sanitize(u.code_acces)}</span>`
    : '<span style="color:rgba(255,255,255,0.2);font-size:11px;">—</span>'
  }</td>
  <td><span style="font-size:11px;color:${u.actif?'#86efac':'#fca5a5'};">${u.actif?'🟢 Actif':'🔴 Bloque'}</span></td>
  <td>
    <div style="display:flex;gap:5px;flex-wrap:wrap;">
      ${u.recu_url ? `<a href="/admin/recu/${sanitize(path.basename(u.recu_url))}" target="_blank" class="abtn" style="background:rgba(59,130,246,0.1);border-color:rgba(59,130,246,0.25);color:#93c5fd;">📄 Recu</a>` : ''}
      <form method="POST" action="/admin/toggle-paid/${u.id}" style="display:inline;">
        <button class="abtn" style="background:${u.paye?'rgba(234,179,8,0.1)':'rgba(34,197,94,0.1)'};border-color:${u.paye?'rgba(234,179,8,0.3)':'rgba(34,197,94,0.3)'};color:${u.paye?'#fde047':'#86efac'};">${u.paye?'⏸ Annuler':'✅ Valider'}</button>
      </form>
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

  const pendingUsers = users.filter(function(u){ return u.recu_url && !u.paye; });

  const statsCards = [
    { ic:'👥', lb:'Inscrits',       val: users.length,                     cl:'#60A5FA' },
    { ic:'💳', lb:'Payes',          val: paidCount,                         cl:'#34D399' },
    { ic:'⏳', lb:'En attente',     val: pendCount,                         cl:'#FBBF24' },
    { ic:'💬', lb:'Messages',       val: msgCount,                          cl:'#F472B6' },
    { ic:'💰', lb:'Revenus',        val: revenue.toLocaleString('fr-FR')+' F', cl:'#FB923C' },
    { ic:'🔥', lb:'Top outil',      val: topOutils[0]?topOutils[0][0]:'—', cl:'#A78BFA' }
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
.chip{font-size:10px;padding:3px 8px;border-radius:6px;font-family:'Syne',sans-serif;font-weight:700;}
.chip-green{background:rgba(34,197,94,0.12);border:1px solid rgba(34,197,94,0.3);color:#86efac;}
.chip-yellow{background:rgba(234,179,8,0.12);border:1px solid rgba(234,179,8,0.3);color:#fde047;}
.chip-gray{background:rgba(100,100,100,0.12);border:1px solid rgba(100,100,100,0.2);color:rgba(255,255,255,0.4);}
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
</style>
</head><body>
<div class="flag"></div>

<!-- HEADER -->
<header style="position:sticky;top:5px;z-index:50;padding:11px 16px;display:flex;align-items:center;justify-content:space-between;background:rgba(6,10,20,0.99);border-bottom:1px solid rgba(255,255,255,0.07);backdrop-filter:blur(16px);">
  <div style="display:flex;align-items:center;gap:10px;">
    <span style="font-size:1.3rem;">🇳🇪</span>
    <div>
      <div class="ht" style="font-size:13px;font-weight:800;color:white;line-height:1.1;">Panel Admin</div>
      <div class="mono" style="font-size:9px;color:#FF7518;">Bac Tools Niger 2026 · v6</div>
    </div>
  </div>
  <div style="display:flex;gap:8px;">
    <a href="/" style="background:rgba(41,171,71,0.1);border:1px solid rgba(41,171,71,0.2);color:#86efac;padding:7px 11px;border-radius:9px;font-family:'Syne',sans-serif;font-size:11px;font-weight:700;text-decoration:none;">🌐 Site</a>
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

  <!-- ONGLETS -->
  <div style="display:flex;gap:7px;overflow-x:auto;margin-bottom:14px;padding-bottom:2px;scrollbar-width:none;">
    <button class="tab-btn${activeTab==='users'?' on':''}" onclick="showTab('users')">
      👥 Utilisateurs${pendCount>0?`<span class="pending-badge">${pendCount}</span>`:''}
    </button>
    <button class="tab-btn${activeTab==='code'?' on':''}" onclick="showTab('code')">⚡ Generer code</button>
    <button class="tab-btn${activeTab==='stats'?' on':''}" onclick="showTab('stats')">📊 Statistiques</button>
    <button class="tab-btn${activeTab==='logs'?' on':''}" onclick="showTab('logs')">📋 Logs</button>
  </div>

  <!-- TAB USERS -->
  <div id="tab-users" class="tab-c${activeTab==='users'?' on':''}">
    <div class="card" style="padding:15px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;flex-wrap:wrap;gap:8px;">
        <h2 class="ht" style="font-size:0.9rem;font-weight:800;color:white;">
          👥 Utilisateurs
          ${pendCount>0?`<span class="chip chip-yellow" style="margin-left:8px;">⏳ ${pendCount} en attente</span>`:''}
        </h2>
        <span style="font-size:12px;color:rgba(255,255,255,0.3);">Total: ${users.length}</span>
      </div>
      <input type="search" class="minp" placeholder="🔍 Rechercher nom, telephone, ecole..." oninput="filterUsers(this.value)" style="margin-bottom:13px;">
      <div style="overflow-x:auto;">
        <table>
          <thead><tr><th>Eleve</th><th>Ecole</th><th>Serie</th><th>Paiement</th><th>Code</th><th>Statut</th><th>Actions</th></tr></thead>
          <tbody id="usersBody">${rows}</tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- TAB GENERER CODE -->
  <div id="tab-code" class="tab-c${activeTab==='code'?' on':''}">
    <div class="card" style="padding:20px;max-width:480px;margin-bottom:16px;">
      <h2 class="ht" style="font-size:0.9rem;font-weight:800;color:white;margin-bottom:14px;">⚡ Generer un code d'acces</h2>
      <p style="font-size:13px;color:rgba(255,255,255,0.45);margin-bottom:18px;line-height:1.6;">Entre le numero de l'eleve pour generer un code unique et activer son compte automatiquement.</p>
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

    ${pendCount > 0 ? `
    <div class="card" style="padding:18px;">
      <div class="ht" style="font-size:13px;font-weight:700;color:#fde047;margin-bottom:14px;">⏳ Reçus en attente (${pendCount})</div>
      ${pendingUsers.map(function(u){ return `
      <div style="background:rgba(234,179,8,0.05);border:1px solid rgba(234,179,8,0.2);border-radius:12px;padding:13px;margin-bottom:9px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div>
            <div class="ht" style="font-size:13px;font-weight:700;color:white;">${sanitize(u.prenom)} ${sanitize(u.nom)}</div>
            <div class="mono" style="font-size:11px;color:rgba(255,255,255,0.4);">${sanitize(u.telephone)} · ${sanitize(u.ecole)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            ${u.recu_url ? `<a href="/admin/recu/${sanitize(path.basename(u.recu_url))}" target="_blank" class="abtn" style="background:rgba(59,130,246,0.1);border-color:rgba(59,130,246,0.25);color:#93c5fd;">👁 Voir recu</a>` : ''}
            <form method="POST" action="/admin/gen-code" style="display:inline;">
              <input type="hidden" name="telephone" value="${sanitize(u.telephone)}">
              <button type="submit" class="abtn" style="background:rgba(34,197,94,0.12);border-color:rgba(34,197,94,0.3);color:#86efac;">⚡ Valider</button>
            </form>
          </div>
        </div>
      </div>`;}).join('')}
    </div>` : ''}
  </div>

  <!-- TAB STATS -->
  <div id="tab-stats" class="tab-c${activeTab==='stats'?' on':''}">
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:14px;">

      <div class="card" style="padding:17px;">
        <h3 class="ht" style="font-size:0.85rem;font-weight:800;color:white;margin-bottom:13px;">📊 Repartition paiements</h3>
        ${[
          ['✅ Payes actifs', paidCount,              '#34D399'],
          ['⏳ Recu envoye', pendCount,               '#FBBF24'],
          ['❌ Non payes',   users.length-paidCount-pendCount, '#F87171']
        ].map(function(r){
          const pct=users.length>0?Math.round(r[1]/users.length*100):0;
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
          const n=users.filter(function(u){return u.serie===s;}).length;
          const pct=users.length>0?Math.round(n/users.length*100):0;
          return n>0?`<div style="margin-bottom:9px;"><div style="display:flex;justify-content:space-between;margin-bottom:3px;"><span style="font-size:12px;color:rgba(255,255,255,0.55);">${s}</span><span class="mono" style="font-size:12px;color:#60A5FA;font-weight:700;">${n}</span></div><div style="height:4px;background:rgba(255,255,255,0.06);border-radius:2px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:#3B82F6;border-radius:2px;"></div></div></div>`:'';
        }).join('')}
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
  <td><span style="font-size:11px;color:${l.action.includes('admin')||l.action.includes('superadmin')?'#FBBF24':l.action.includes('connexion')?'#86efac':'rgba(255,255,255,0.55)'};">${sanitize(l.action)}</span></td>
  <td style="font-size:11px;color:rgba(255,255,255,0.45);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sanitize(l.details||'—')}</td>
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
