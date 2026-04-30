'use strict';

const express  = require('express');
const router   = express.Router();
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const supabase = require('../db/supabase');
const { CSS }  = require('../utils/styles');
const { requireUser } = require('../middlewares/auth');
const { sanitize }    = require('../utils/helpers');

const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const d = path.join(__dirname, '../public/flamme');
      if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
      cb(null, d);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g,'');
      const crypto = require('crypto');
      cb(null, 'media-' + Date.now() + '-' + crypto.randomBytes(8).toString('hex') + ext);
    }
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    const ok = ['.jpg','.jpeg','.png','.gif','.webp','.pdf'];
    ok.includes(path.extname(file.originalname).toLowerCase()) ? cb(null,true) : cb(new Error('Format non supporte'));
  }
});

router.use(requireUser);

// ── GET /flamme ──
router.get('/', async function(req, res) {
  try {
    const { data: user } = await supabase.from('users').select('*').eq('id', req.session.userId).single();
    if (!user) { req.session.destroy(); return res.redirect('/'); }
    const { data: msgs } = await supabase.from('messages')
      .select('*').eq('supprime', false)
      .order('envoye_le', { ascending: true }).limit(120);
    res.send(renderFlamme(user, msgs || []));
  } catch(err) {
    console.error('[ERR flamme]', err.message);
    res.redirect('/dashboard');
  }
});

// ── POST /flamme/send ──
router.post('/send', upload.single('media'), async function(req, res) {
  try {
    const { data: user } = await supabase.from('users')
      .select('id,code_anonyme').eq('id', req.session.userId).single();
    if (!user) return res.redirect('/connexion');

    const contenu = (req.body.contenu || '').trim().slice(0, 1000);
    const hasMedia = !!req.file;
    const hasText  = contenu.length > 0;
    if (!hasText && !hasMedia) return res.redirect('/flamme');

    const type     = hasMedia ? (req.file.mimetype.startsWith('image/') ? 'image' : 'fichier') : 'texte';
    const mediaUrl = hasMedia ? '/flamme-media/' + req.file.filename : null;

    await supabase.from('messages').insert({
      user_id: user.id, code_anonyme: user.code_anonyme,
      contenu: hasText ? contenu : '', type, media_url: mediaUrl
    });
    res.redirect('/flamme');
  } catch(err) {
    console.error('[ERR flamme send]', err.message);
    res.redirect('/flamme');
  }
});

// ── GET /flamme/api — polling ──
router.get('/api', async function(req, res) {
  try {
    const since = req.query.since || '1970-01-01';
    const { data: msgs } = await supabase.from('messages')
      .select('*').eq('supprime', false)
      .gt('envoye_le', since)
      .order('envoye_le', { ascending: true }).limit(50);
    res.json({ messages: msgs || [], time: new Date().toISOString() });
  } catch(e) {
    res.json({ messages: [], time: new Date().toISOString() });
  }
});

// ── POST /flamme/delete/:id — admin ──
router.post('/delete/:id', async function(req, res) {
  if (!req.session.adminAuth) return res.status(403).json({ error: 'Non autorise' });
  try {
    await supabase.from('messages').update({ supprime: true }).eq('id', req.params.id);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: 'Erreur' }); }
});

// ════════════════════════════════════════════════════════════
// RENDER FLAMME
// ════════════════════════════════════════════════════════════
function renderFlamme(user, messages) {
  const myId   = user.id;
  const myCode = user.code_anonyme || 'ANONYME';
  const lastTime = messages.length > 0 ? messages[messages.length-1].envoye_le : '1970-01-01';

  const msgsHtml = messages.map(function(msg) {
    const isMe = msg.user_id === myId;
    const t    = new Date(msg.envoye_le);
    const ts   = t.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    let content = '';
    if (msg.type === 'image' && msg.media_url) {
      content = `<img src="${sanitize(msg.media_url)}" loading="lazy" style="max-width:200px;max-height:200px;border-radius:10px;display:block;cursor:pointer;" onclick="window.open(this.src,'_blank')">`;
      if (msg.contenu) content += `<div style="margin-top:5px;font-size:14px;line-height:1.5;word-break:break-word;">${sanitize(msg.contenu)}</div>`;
    } else if (msg.type === 'fichier' && msg.media_url) {
      content = `<a href="${sanitize(msg.media_url)}" target="_blank" style="color:#60A5FA;text-decoration:none;font-size:13px;">📄 Voir le fichier</a>`;
      if (msg.contenu) content += `<div style="margin-top:4px;font-size:13px;">${sanitize(msg.contenu)}</div>`;
    } else {
      content = `<div style="font-size:14px;line-height:1.6;word-break:break-word;">${sanitize(msg.contenu)}</div>`;
    }
    return `<div style="display:flex;flex-direction:column;${isMe?'align-items:flex-end':'align-items:flex-start'};margin-bottom:10px;">
  <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;${isMe?'flex-direction:row-reverse':''}">
    <span class="mono" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:100px;background:${isMe?'rgba(255,117,24,0.2)':'rgba(255,255,255,0.07)'};color:${isMe?'#FF7518':'rgba(255,255,255,0.5)'};">${sanitize(msg.code_anonyme)}</span>
    <span style="font-size:9px;color:rgba(255,255,255,0.2);">${ts}</span>
  </div>
  <div style="max-width:78%;background:${isMe?'linear-gradient(135deg,rgba(255,117,24,0.18),rgba(255,69,0,0.10))':'rgba(255,255,255,0.06)'};border:1px solid ${isMe?'rgba(255,117,24,0.25)':'rgba(255,255,255,0.08)'};border-radius:${isMe?'14px 3px 14px 14px':'3px 14px 14px 14px'};padding:10px 13px;">
    ${content}
  </div>
</div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no">
<meta name="theme-color" content="#060A14">
<title>🔥 La Flamme — Bac Tools Niger 2026</title>
${CSS}
<style>
body{background:#060A14;display:flex;flex-direction:column;height:100vh;height:100dvh;overflow:hidden;padding-top:5px;}
.chat-header{flex-shrink:0;padding:11px 15px;background:rgba(6,10,20,0.98);border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:center;gap:11px;backdrop-filter:blur(16px);}
.chat-body{flex:1;overflow-y:auto;padding:14px;scroll-behavior:smooth;}
.chat-footer{flex-shrink:0;padding:11px 14px;background:rgba(6,10,20,0.98);border-top:1px solid rgba(255,255,255,0.07);}
.send-form{display:flex;gap:8px;align-items:flex-end;}
.msg-inp{flex:1;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.10);color:white;border-radius:12px;padding:10px 13px;font-size:14px;font-family:'Noto Sans',sans-serif;resize:none;max-height:100px;line-height:1.4;transition:border-color 0.2s;}
.msg-inp:focus{border-color:#FF7518;outline:none;}
.msg-inp::placeholder{color:rgba(255,255,255,0.3);}
.send-btn{background:linear-gradient(135deg,#FF7518,#FF4500);color:white;border:none;border-radius:11px;width:43px;height:43px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;flex-shrink:0;transition:transform 0.2s;}
.send-btn:hover{transform:scale(1.06);}
.media-btn{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.10);color:rgba(255,255,255,0.6);border-radius:11px;width:43px;height:43px;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;flex-shrink:0;transition:background 0.2s;}
.media-btn:hover{background:rgba(255,255,255,0.12);}
.dot{width:8px;height:8px;background:#29AB47;border-radius:50%;animation:pulse 2s infinite;}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.35;}}
</style>
</head><body>
<div class="flag"></div>

<div class="chat-header">
  <a href="/dashboard" style="color:rgba(255,255,255,0.4);text-decoration:none;font-size:22px;line-height:1;flex-shrink:0;">←</a>
  <div style="font-size:1.5rem;">🔥</div>
  <div style="flex:1;min-width:0;">
    <div class="ht" style="font-size:14px;font-weight:800;color:white;">La Flamme Nigerienne</div>
    <div style="font-size:11px;color:rgba(255,255,255,0.4);display:flex;align-items:center;gap:5px;">
      <span class="dot"></span>
      Chat anonyme · <span class="mono" style="color:#FF7518;">${sanitize(myCode)}</span>
    </div>
  </div>
  <div style="background:rgba(255,69,0,0.12);border:1px solid rgba(255,69,0,0.25);border-radius:8px;padding:4px 10px;font-size:10px;font-family:'Syne',sans-serif;color:#FF7518;font-weight:700;">LIVE 🔴</div>
</div>

<div class="chat-body" id="chatBody">
  ${messages.length === 0 ? `
  <div style="text-align:center;padding:50px 20px;color:rgba(255,255,255,0.3);">
    <div style="font-size:3rem;margin-bottom:12px;">🔥</div>
    <div class="ht" style="font-size:14px;font-weight:700;color:rgba(255,255,255,0.5);margin-bottom:6px;">La Flamme Nigerienne</div>
    <div style="font-size:12px;line-height:1.6;">Sois le premier a allumer la flamme !<br>Pose ta question, partage tes revisions 🚀</div>
  </div>` : msgsHtml}
  <div id="chatEnd"></div>
</div>

<div class="chat-footer">
  <form method="POST" action="/flamme/send" enctype="multipart/form-data" id="sendForm">
    <input type="file" id="mediaInput" name="media" accept="image/*,.pdf" style="display:none;" onchange="previewMedia(this)">
    <div id="mediaPreview" style="display:none;margin-bottom:7px;"></div>
    <div class="send-form">
      <button type="button" class="media-btn" onclick="document.getElementById('mediaInput').click()">📎</button>
      <textarea class="msg-inp" name="contenu" id="msgInput" placeholder="Ecris ton message..." rows="1"
        onkeydown="handleKey(event)" oninput="autoResize(this)"></textarea>
      <button type="submit" class="send-btn">➤</button>
    </div>
  </form>
  <div style="font-size:10px;color:rgba(255,255,255,0.18);text-align:center;margin-top:5px;">
    🔒 Anonyme · Pseudo: <span class="mono" style="color:rgba(255,255,255,0.3);">${sanitize(myCode)}</span>
  </div>
</div>

<script>
var myUserId = ${myId};
var lastTime = '${sanitize(lastTime)}';

function scrollBottom(){
  var el=document.getElementById('chatEnd');
  if(el) el.scrollIntoView({behavior:'smooth'});
}
scrollBottom();

function autoResize(el){
  el.style.height='auto';
  el.style.height=Math.min(el.scrollHeight,100)+'px';
}

function handleKey(e){
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();document.getElementById('sendForm').submit();}
}

function previewMedia(input){
  var prev=document.getElementById('mediaPreview');
  if(!input.files||!input.files[0]){prev.style.display='none';return;}
  prev.style.display='block';
  prev.innerHTML='<div style="background:rgba(255,117,24,0.1);border:1px solid rgba(255,117,24,0.25);border-radius:9px;padding:7px 12px;font-size:12px;color:#FF7518;display:flex;justify-content:space-between;align-items:center;"><span>📎 '+input.files[0].name.slice(0,28)+'</span><button type="button" onclick="clearMedia()" style="background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;font-size:15px;">✕</button></div>';
}
function clearMedia(){
  document.getElementById('mediaInput').value='';
  document.getElementById('mediaPreview').style.display='none';
}

function esc(t){
  if(!t)return'';
  return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function buildMsg(msg){
  var isMe=(msg.user_id===myUserId);
  var t=new Date(msg.envoye_le);
  var ts=t.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  var content='';
  if(msg.type==='image'&&msg.media_url){
    content='<img src="'+esc(msg.media_url)+'" loading="lazy" style="max-width:200px;max-height:200px;border-radius:10px;display:block;cursor:pointer;" onclick="window.open(this.src,\'_blank\')">';
    if(msg.contenu)content+='<div style="margin-top:5px;font-size:14px;line-height:1.5;word-break:break-word;">'+esc(msg.contenu)+'</div>';
  }else if(msg.type==='fichier'&&msg.media_url){
    content='<a href="'+esc(msg.media_url)+'" target="_blank" style="color:#60A5FA;text-decoration:none;font-size:13px;">📄 Voir le fichier</a>';
    if(msg.contenu)content+='<div style="margin-top:4px;font-size:13px;">'+esc(msg.contenu)+'</div>';
  }else{
    content='<div style="font-size:14px;line-height:1.6;word-break:break-word;">'+esc(msg.contenu)+'</div>';
  }
  var align=isMe?'align-items:flex-end':'align-items:flex-start';
  var dir=isMe?'flex-direction:row-reverse':'';
  var bg=isMe?'linear-gradient(135deg,rgba(255,117,24,0.18),rgba(255,69,0,0.10))':'rgba(255,255,255,0.06)';
  var bc=isMe?'rgba(255,117,24,0.25)':'rgba(255,255,255,0.08)';
  var br=isMe?'14px 3px 14px 14px':'3px 14px 14px 14px';
  var cl=isMe?'#FF7518':'rgba(255,255,255,0.5)';
  var cb=isMe?'rgba(255,117,24,0.2)':'rgba(255,255,255,0.07)';
  return '<div style="display:flex;flex-direction:column;'+align+';margin-bottom:10px;"><div style="display:flex;align-items:center;gap:5px;margin-bottom:3px;'+dir+'"><span class="mono" style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:100px;background:'+cb+';color:'+cl+';">'+esc(msg.code_anonyme)+'</span><span style="font-size:9px;color:rgba(255,255,255,0.2);">'+ts+'</span></div><div style="max-width:78%;background:'+bg+';border:1px solid '+bc+';border-radius:'+br+';padding:10px 13px;">'+content+'</div></div>';
}

async function pollMessages(){
  try{
    var r=await fetch('/flamme/api?since='+encodeURIComponent(lastTime));
    var d=await r.json();
    if(d.messages&&d.messages.length>0){
      var cb=document.getElementById('chatBody');
      var end=document.getElementById('chatEnd');
      d.messages.forEach(function(msg){
        var wrapper=document.createElement('div');
        wrapper.innerHTML=buildMsg(msg);
        cb.insertBefore(wrapper.firstElementChild||wrapper,end);
      });
      lastTime=d.time;
      scrollBottom();
    }
  }catch(e){}
}
setInterval(pollMessages, 4000);
</script>
</body></html>`;
}

module.exports = router;
