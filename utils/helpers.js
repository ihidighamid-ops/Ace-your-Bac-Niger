'use strict';

const crypto = require('crypto');

// ── Sanitize HTML ──────────────────────────────────────────────────
function sanitize(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;')
    .trim();
}

// ── Nettoyer un numéro de téléphone ───────────────────────────────
function cleanPhone(tel) {
  return (tel || '').replace(/[\s\-\+\.]/g, '');
}

// ── Générer un code d'accès — cryptographiquement sécurisé ────────
function genCode(length) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const len   = length || 8;
  let c = '';
  const bytes = crypto.randomBytes(len * 2);
  for (let i = 0; i < len; i++) {
    c += chars[bytes[i] % chars.length];
  }
  return c;
}

// ── Générer un code anonyme (pseudo) — cryptographiquement sécurisé
function genCodeAnonyme() {
  const mots = [
    'LION','AIGLE','DUNE','SAHEL','FLEUVE','ORAGE','ETOILE',
    'SOLEIL','TIGRE','COBRA','FAUCON','NIGER','SAHARA',
    'OASIS','GAZELLE','DODO','FLECHE','ATLAS','DELTA'
  ];
  const randomIndex  = crypto.randomBytes(1)[0] % mots.length;
  const randomNumber = 100 + (crypto.randomBytes(2).readUInt16BE(0) % 900);
  return mots[randomIndex] + randomNumber;
}

// ── Logger une action en DB ───────────────────────────────────────
async function logAction(supabase, userId, action, details, ip) {
  try {
    const { error } = await supabase.from('logs').insert({
      user_id: userId || null,
      action:  action,
      details: details || null,
      ip:      ip     || null
    });
    if (error) console.error('[LOG ERROR]', action, error.message);
  } catch (e) {
    console.error('[LOG CRASH]', e.message);
  }
}

// ── Upload vers Supabase Storage (remplace Multer local) ──────────
// Retourne l'URL publique signée ou null en cas d'erreur
async function uploadToStorage(supabase, fileBuffer, originalName, mimeType) {
  try {
    const ext      = originalName.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
    const randomId = crypto.randomBytes(8).toString('hex');
    const filename = 'recu-' + Date.now() + '-' + randomId + '.' + ext;
    const path     = filename;

    const { data, error } = await supabase.storage
      .from('recus')
      .upload(path, fileBuffer, {
        contentType:  mimeType || 'application/octet-stream',
        cacheControl: '3600',
        upsert:       false
      });

    if (error) {
      console.error('[STORAGE UPLOAD ERROR]', error.message);
      return null;
    }

    // URL signée valable 10 ans (ou utiliser getPublicUrl si bucket public)
    const { data: urlData } = supabase.storage
      .from('recus')
      .getPublicUrl(path);

    return urlData ? urlData.publicUrl : null;
  } catch (e) {
    console.error('[STORAGE CRASH]', e.message);
    return null;
  }
}

// ── Supprimer un fichier du Storage ──────────────────────────────
async function deleteFromStorage(supabase, publicUrl) {
  if (!publicUrl) return;
  try {
    // Extraire le path depuis l'URL publique
    const parts = publicUrl.split('/recus/');
    if (parts.length < 2) return;
    const filePath = parts[1];
    const { error } = await supabase.storage.from('recus').remove([filePath]);
    if (error) console.error('[STORAGE DELETE ERROR]', error.message);
  } catch (e) {
    console.error('[STORAGE DELETE CRASH]', e.message);
  }
}

module.exports = {
  sanitize,
  cleanPhone,
  genCode,
  genCodeAnonyme,
  logAction,
  uploadToStorage,
  deleteFromStorage
};
