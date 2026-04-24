'use strict';

function sanitize(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}

function cleanPhone(tel) {
  return (tel || '').replace(/[\s\-\+\.]/g, '');
}

function genCode(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c = '';
  for (let i = 0; i < (length || 8); i++) {
    c += chars[Math.floor(Math.random() * chars.length)];
  }
  return c;
}

function genCodeAnonyme() {
  const mots = [
    'LION','AIGLE','DUNE','SAHEL','FLEUVE','ORAGE','ETOILE',
    'SOLEIL','TIGRE','COBRA','FAUCON','NIGER','SAHARA',
    'OASIS','GAZELLE','DODO','FLECHE','ATLAS','DELTA'
  ];
  return mots[Math.floor(Math.random() * mots.length)] +
    Math.floor(100 + Math.random() * 900);
}

async function logAction(supabase, userId, action, details, ip) {
  try {
    await supabase.from('logs').insert({
      user_id: userId || null,
      action: action,
      details: details || null,
      ip: ip || null
    });
  } catch (e) {
    // silencieux
  }
}

module.exports = { sanitize, cleanPhone, genCode, genCodeAnonyme, logAction };
