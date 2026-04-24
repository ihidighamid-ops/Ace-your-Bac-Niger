'use strict';

const express  = require('express');
const router   = express.Router();
const supabase = require('../db/supabase');
const tools    = require('../data/tools');
const { CSS, STARS_JS } = require('../utils/styles');
const { requireUser }   = require('../middlewares/auth');
const { sanitize }      = require('../utils/helpers');

// ── Toutes les routes dashboard nécessitent un utilisateur connecté ──
router.use(requireUser);

// ════════════════════════════════════════════════════════════
// GET /dashboard
// ════════════════════════════════════════════════════════════
router.get('/', async function(req, res) {
  try {
    const { data: user } = await supabase
      .from('users').select('*').eq('id', req.session.userId).single();
    if (!user) { req.session.destroy(); return res.redirect('/'); }
    if (!user.actif) { req.session.destroy(); return res.redirect('/connexion'); }
    res.send(renderDashboard(user));
  } catch(err) {
    console.error('[ERR dashboard]', err.message);
    res.redirect('/');
  }
});

// ════════════════════════════════════════════════════════════
// GET /dashboard/redirect/:id — redirection masquée + tracking
// ════════════════════════════════════════════════════════════
router.get('/redirect/:id', async function(req, res) {
  const toolId = parseInt(req.params.id, 10);
  if (isNaN(toolId)) return res.redirect('/dashboard');
  const tool = tools.find(function(t) { return t.id === toolId; });
  if (!tool) return res.redirect('/dashboard');

  // Tracking non bloquant
  supabase.from('tool_clicks').insert({
    tool_id:  toolId,
    tool_nom: tool.nom,
    user_id:  req.session.userId
  }).then(function(){}).catch(function(){});

  // URL réelle jamais exposée au frontend
  res.redirect(tool.url);
});

// ════════════════════════════════════════════════════════════
// RENDER DASHBOARD
// ════════════════════════════════════════════════════════════
function renderDashboard(user) {
  const cats = [
    { id:'all',          label:'🌟 Tous',       count: tools.length },
    { id:'bac',          label:'📋 BAC',         count: tools.filter(function(t){return t.categorie==='bac';}).length },
    { id:'cours',        label:'📚 Cours',       count: tools.filter(function(t){return t.categorie==='cours';}).length },
    { id:'general',      label:'🌍 General',     count: tools.filter(function(t){return t.categorie==='general';}).length },
    { id:'bibliotheque', label:'📖 Bibliotheque',count: tools.filter(function(t){return t.categorie==='bibliotheque';}).length },
    { id:'ia',           label:'🤖 IA',          count: tools.filter(function(t){return t.categorie==='ia';}).length }
  ];

  const toolCards = tools.map(function(tool, idx) {
    const isIA = tool.categorie === 'ia';
    return `<a href="/dashboard/redirect/${tool.id}"
       class="tool-card${isIA?' ia-card':''}"
       data-cat="${sanitize(tool.categorie)}"
       target="_blank" rel="noopener noreferrer"
       style="animation-delay:${idx*0.035}s;">
  <div class="tool-top" style="background:${sanitize(tool.gradient)};">
    <span class="tool-icon">${sanitize(tool.icone)}</span>
  </div>
  <div class="tool-body">
    <div class="tool-name">${sanitize(tool.nom)}</div>
    <div class="tool-desc">${sanitize(tool.description)}</div>
    <div class="tool-conseil">${sanitize(tool.conseil)}</div>
  </div>
</a>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#080D1A">
<title>Dashboard — Bac Tools Niger 2026</title>
${CSS}
<style>
body{background:#080D1A;padding-top:5px;}

/* SIDEBAR */
.sidebar{position:fixed;left:0;top:0;bottom:0;width:255px;background:rgba(5,8,18,0.99);border-right:1px solid rgba(255,255,255,0.07);z-index:200;display:flex;flex-direction:column;padding-top:5px;overflow-y:auto;transition:transform 0.28s cubic-bezier(.4,0,.2,1);}
@media(max-width:850px){.sidebar{transform:translateX(-255px);}.sidebar.open{transform:translateX(0);}.main{margin-left:0!important;}.overlay{display:block!important;}}
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:199;backdrop-filter:blur(3px);}
.main{margin-left:255px;min-height:100vh;}
.nav-sect{padding:8px 14px;font-size:10px;color:rgba(255,255,255,0.25);font-family:'Syne',sans-serif;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;margin-top:6px;}
.nav-item{display:flex;align-items:center;gap:10px;padding:11px 16px;border-radius:12px;color:rgba(255,255,255,0.5);font-size:13px;font-weight:600;font-family:'Syne',sans-serif;cursor:pointer;transition:all 0.18s;text-decoration:none;border:1px solid transparent;margin:2px 8px;}
.nav-item:hover,.nav-item.active{background:rgba(255,117,24,0.1);color:#FF7518;border-color:rgba(255,117,24,0.18);}
.nav-flamme{background:rgba(255,117,24,0.08)!important;border-color:rgba(255,117,24,0.2)!important;color:#FF7518!important;}

/* TOPBAR */
.topbar{position:sticky;top:5px;z-index:100;background:rgba(8,13,26,0.97);border-bottom:1px solid rgba(255,255,255,0.06);backdrop-filter:blur(16px);padding:11px 16px;display:flex;align-items:center;gap:10px;}
.menu-btn{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);color:white;border-radius:9px;padding:8px 11px;cursor:pointer;font-size:17px;display:none;flex-shrink:0;line-height:1;}
@media(max-width:850px){.menu-btn{display:flex;align-items:center;justify-content:center;}}

/* GRID OUTILS */
.tools-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:13px;padding:16px;}
@media(max-width:480px){.tools-grid{grid-template-columns:repeat(2,1fr);gap:10px;padding:12px;}}

/* TOOL CARD */
.tool-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:15px;overflow:hidden;text-decoration:none;display:flex;flex-direction:column;transition:transform 0.22s,border-color 0.22s,box-shadow 0.22s;animation:popIn 0.32s ease forwards;opacity:0;-webkit-tap-highlight-color:transparent;}
.tool-card:hover{transform:translateY(-4px);border-color:rgba(255,255,255,0.16);box-shadow:0 10px 30px rgba(0,0,0,0.45);}
.ia-card{border-color:rgba(99,102,241,0.3)!important;background:rgba(99,102,241,0.05)!important;}
.ia-card:hover{border-color:rgba(99,102,241,0.6)!important;box-shadow:0 10px 30px rgba(99,102,241,0.2)!important;}
.tool-top{padding:18px 14px 14px;min-height:70px;display:flex;flex-direction:column;justify-content:flex-end;}
.tool-icon{font-size:1.9rem;line-height:1;margin-bottom:0;}
.tool-body{padding:10px 13px 13px;flex:1;display:flex;flex-direction:column;gap:3px;}
.tool-name{font-family:'Syne',sans-serif;font-weight:800;font-size:13px;color:white;line-height:1.2;}
.tool-desc{font-size:11px;color:rgba(255,255,255,0.45);line-height:1.4;flex:1;}
.tool-conseil{font-size:10px;color:rgba(255,183,60,0.8);border-top:1px solid rgba(255,255,255,0.06);padding-top:5px;margin-top:4px;line-height:1.35;}

/* CATS */
.cats{display:flex;gap:7px;overflow-x:auto;padding:0 16px 10px;scrollbar-width:none;-ms-overflow-style:none;}
.cats::-webkit-scrollbar{display:none;}
.cat-btn{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.55);border-radius:100px;padding:7px 13px;font-size:12px;font-family:'Syne',sans-serif;font-weight:700;cursor:pointer;transition:all 0.18s;white-space:nowrap;-webkit-tap-highlight-color:transparent;}
.cat-btn.active,.cat-btn:hover{background:rgba(255,117,24,0.14);border-color:rgba(255,117,24,0.4);color:#FF7518;}

/* SEARCH */
.search-wrap{position:relative;padding:13px 16px 0;}
.search-icon{position:absolute;left:29px;top:50%;transform:translateY(-15%);color:rgba(255,255,255,0.28);font-size:15px;pointer-events:none;}
.search-inp{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.10);color:white;border-radius:12px;padding:10px 14px 10px 38px;font-size:14px;font-family:'Noto Sans',sans-serif;width:100%;transition:border-color 0.2s;}
.search-inp:focus{border-color:#FF7518;outline:none;}
.search-inp::placeholder{color:rgba(255,255,255,0.3);}

/* USER CARD */
.user-card{background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:13px;padding:13px 15px;margin:8px;}
.avatar{width:36px;height:36px;background:linear-gradient(135deg,#FF7518,#FF4500);border-radius:50%;display:flex;align-items:center;justify-content:center;font-family:'Syne',sans-serif;font-weight:800;font-size:14px;color:white;flex-shrink:0;}

.no-results{text-align:center;padding:40px 20px;color:rgba(255,255,255,0.3);}
</style>
</head><body>
<div class="flag"></div>
<div class="overlay" id="overlay" onclick="closeSidebar()"></div>

<!-- SIDEBAR -->
<nav class="sidebar" id="sidebar">
  <div style="padding:14px 12px 8px;">
    <div style="display:flex;align-items:center;gap:8px;padding:8px 8px 14px;border-bottom:1px solid rgba(255,255,255,0.07);">
      <span style="font-size:1.4rem;">🇳🇪</span>
      <div>
        <div class="ht" style="font-size:13px;font-weight:800;color:white;line-height:1.1;">Bac Tools Niger</div>
        <div class="mono" style="font-size:9px;color:#FF7518;letter-spacing:0.05em;">2026 · v6 FINAL</div>
      </div>
    </div>
    <div class="user-card" style="margin:12px 0 6px;">
      <div style="display:flex;align-items:center;gap:10px;">
        <div class="avatar">${sanitize(user.prenom ? user.prenom[0].toUpperCase() : 'E')}</div>
        <div>
          <div style="font-family:'Syne',sans-serif;font-weight:700;font-size:13px;color:white;">${sanitize(user.prenom)} ${sanitize(user.nom)}</div>
          <div style="font-size:11px;color:rgba(255,255,255,0.4);">${sanitize(user.serie)} · ${sanitize(user.ville)}</div>
        </div>
      </div>
    </div>
  </div>
  <div style="padding:4px 0;flex:1;">
    <div class="nav-sect">Navigation</div>
    <a href="/dashboard" class="nav-item active">📊 Dashboard</a>
    <a href="/flamme" class="nav-item nav-flamme">🔥 La Flamme</a>
    <div class="nav-sect" style="margin-top:10px;">Categories</div>
    ${cats.map(function(c){return `<a class="nav-item" href="#" onclick="filterCat('${c.id}');closeSidebar();return false;">${c.label} <span style="margin-left:auto;opacity:0.4;font-size:11px;">${c.count}</span></a>`;}).join('\n')}
  </div>
  <div style="padding:12px;">
    <a href="/logout" style="display:flex;align-items:center;gap:8px;padding:10px 16px;border-radius:12px;color:rgba(255,100,100,0.7);font-size:12px;font-family:'Syne',sans-serif;font-weight:700;text-decoration:none;background:rgba(220,38,38,0.06);border:1px solid rgba(220,38,38,0.1);transition:all 0.2s;" onclick="return confirm('Se deconnecter ?')">🚪 Deconnexion</a>
  </div>
</nav>

<!-- MAIN -->
<div class="main">
  <div class="topbar">
    <button class="menu-btn" onclick="toggleSidebar()">☰</button>
    <div style="flex:1;min-width:0;">
      <div class="ht" style="font-size:14px;font-weight:800;color:white;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">🇳🇪 Bac Tools Niger 2026</div>
    </div>
    <a href="/flamme" style="background:rgba(255,117,24,0.15);border:1px solid rgba(255,117,24,0.3);color:#FF7518;padding:8px 13px;border-radius:10px;font-family:'Syne',sans-serif;font-size:12px;font-weight:700;text-decoration:none;white-space:nowrap;flex-shrink:0;">🔥 La Flamme</a>
  </div>

  <div style="padding:13px 16px 0;">
    <div style="background:rgba(255,117,24,0.08);border:1px solid rgba(255,117,24,0.18);border-radius:13px;padding:12px 15px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:1.4rem;">👋</span>
      <div>
        <div class="ht" style="font-size:14px;font-weight:700;color:white;">Bon courage ${sanitize(user.prenom)} !</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.4);">🏆 BAC 2026 · ${sanitize(user.serie)} · ${sanitize(user.ecole)}</div>
      </div>
    </div>
  </div>

  <div class="search-wrap">
    <span class="search-icon">🔍</span>
    <input class="search-inp" type="search" id="searchInput" placeholder="Rechercher un outil..." oninput="doSearch(this.value)">
  </div>

  <div class="cats" id="catsRow" style="margin-top:13px;">
    ${cats.map(function(c){return `<button class="cat-btn${c.id==='all'?' active':''}" onclick="filterCat('${c.id}')" data-cat="${c.id}">${c.label} <span style="opacity:0.45;margin-left:2px;">${c.count}</span></button>`;}).join('')}
  </div>

  <div class="tools-grid" id="toolsGrid">${toolCards}</div>
  <div class="no-results" id="noResults" style="display:none;"><div style="font-size:3rem;margin-bottom:10px;">🔍</div><p>Aucun outil trouve</p></div>

  <div style="text-align:center;padding:22px 16px;border-top:1px solid rgba(255,255,255,0.05);margin-top:6px;">
    <div style="font-size:12px;color:rgba(255,255,255,0.2);">🇳🇪 Bac Tools Niger 2026 · <span style="color:#FF7518;">Reussis ton BAC !</span></div>
    <div style="font-size:10px;color:rgba(255,255,255,0.12);margin-top:3px;">Pseudo chat: <span class="mono">${sanitize(user.code_anonyme)}</span></div>
  </div>
</div>

<script>
var currentCat = 'all';

function toggleSidebar(){
  var s=document.getElementById('sidebar');
  var o=document.getElementById('overlay');
  var open=s.classList.toggle('open');
  o.style.display=open?'block':'none';
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('overlay').style.display='none';
}
function filterCat(cat){
  currentCat=cat;
  document.querySelectorAll('.cat-btn').forEach(function(b){b.classList.toggle('active',b.dataset.cat===cat);});
  applyFilter();
}
function doSearch(q){ applyFilter(q); }
function applyFilter(q){
  q=(q||document.getElementById('searchInput').value||'').toLowerCase().trim();
  var cards=document.querySelectorAll('.tool-card');
  var visible=0;
  cards.forEach(function(card){
    var catOk=(currentCat==='all'||card.dataset.cat===currentCat);
    var txtOk=(!q||card.innerText.toLowerCase().includes(q));
    var show=catOk&&txtOk;
    card.style.display=show?'flex':'none';
    if(show)visible++;
  });
  document.getElementById('noResults').style.display=visible===0?'block':'none';
}
// Swipe sidebar mobile
var _tx=0;
document.addEventListener('touchstart',function(e){_tx=e.touches[0].clientX;},{passive:true});
document.addEventListener('touchend',function(e){
  var dx=e.changedTouches[0].clientX-_tx;
  if(dx>55&&_tx<35)toggleSidebar();
  if(dx<-55)closeSidebar();
},{passive:true});
</script>
</body></html>`;
}

module.exports = router;
