'use strict';

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

if (!SUPABASE_URL) console.error('[FATAL] SUPABASE_URL manquant dans les variables d\'env');
if (!SUPABASE_KEY) console.error('[FATAL] SUPABASE_KEY manquant dans les variables d\'env');

const supabase = createClient(
  SUPABASE_URL || 'https://placeholder.supabase.co',
  SUPABASE_KEY || 'placeholder',
  { auth: { persistSession: false } }
);

module.exports = supabase;
