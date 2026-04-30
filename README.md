# 🇳🇪 Bac Tools Niger 2026 — v7.0

## ✅ Bugs corrigés dans cette version

### Bug 1 — Inscription (critique)
- **`.single()` → `.maybeSingle()`** : corrige le crash silencieux si doublon absent
- **Session userId** : après inscription réussie, `req.session.userId` est stocké immédiatement
- Logs détaillés avant/après chaque requête Supabase
- Messages d'erreur explicites (plus de "Erreur serveur" vague)

### Bug 2 — Page /paiement inaccessible
- La route `/paiement` est maintenant **protégée par session**
- Redirection vers `/inscription` si aucune session active
- Vérification DB que l'userId en session existe bien

### Bug 3 — Données non enregistrées après paiement
- Identification par **userId de session** (plus par téléphone)
- `statut` mis à `'paiement_en_attente'` + `paye: false` ensemble lors du POST
- Plus aucun crash silencieux — logs à chaque étape

### Bug 4 — Admin ne voit pas les utilisateurs
- Filtre sur `statut = 'paiement_en_attente'` (plus sur `recu_url && !paye`)
- Nouvel onglet "⏳ En attente" dédié avec boutons Valider/Rejeter par ID
- Logs explicites à chaque action

### Faille critique — Stockage local Multer
- **Multer `memoryStorage()`** : les fichiers ne touchent plus le disque
- Upload direct vers **Supabase Storage** (bucket `recus`)
- URL publique stockée en DB — persiste après redéploiement Render

### Faille critique — Identification par téléphone
- Toutes les opérations utilisent désormais `req.session.userId`
- Le téléphone ne sert plus qu'à la connexion initiale

---

## 🚀 Déploiement sur Render

### Variables d'environnement obligatoires
```
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=your_service_role_key  ← IMPORTANTE : utiliser la SERVICE ROLE key (pas anon)
SESSION_SECRET=une_chaine_aleatoire_longue_et_securisee
ADMIN_PHONE=22799193823
ADMIN_MASTER_KEY=ADMIN2026Bacniger
NODE_ENV=production
```

> ⚠️ **Utilise la `service_role` key de Supabase** (pas la `anon key`) pour que l'upload Storage fonctionne sans RLS.

### Setup Supabase Storage
1. Dashboard Supabase → Storage → **New Bucket**
2. Nom : `recus`
3. Public : **Non** (accès via service_role uniquement)
4. Policy : avec la service_role key, tout est automatiquement autorisé

### Schema SQL
Coller le contenu de `db/schema.sql` dans SQL Editor de Supabase et cliquer Run.

---

## 🔄 Flux utilisateur v7

```
/inscription  → créer user + session.userId + statut='inscrit'
       ↓
/paiement     → protégé session → upload reçu Storage → statut='paiement_en_attente'
       ↓
[Admin valide] → code généré auto → statut='valide' + paye=true
       ↓
/connexion    → téléphone + code → session.userId → /dashboard
```

## 📊 Statuts utilisateurs

| Statut | Description |
|--------|-------------|
| `inscrit` | Compte créé, reçu non soumis |
| `paiement_en_attente` | Reçu soumis, validation en cours |
| `valide` | Paiement validé, code généré |
| `rejete` | Paiement rejeté par admin |
