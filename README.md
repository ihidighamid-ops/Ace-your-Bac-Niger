# 🇳🇪 Bac Tools Niger 2026 — v6 FINAL

## 🚀 DÉPLOIEMENT EN 3 ÉTAPES

### 1. Supabase (base de données)
1. Créer un projet sur supabase.com
2. SQL Editor → coller le contenu de `db/schema.sql` → Run
3. Récupérer dans Settings > API :
   - `SUPABASE_URL` (Project URL)
   - `SUPABASE_KEY` (anon public key)

### 2. GitHub
1. Créer un nouveau repo GitHub (private recommandé)
2. Uploader tous les fichiers du dossier `nigerbac_v6/`
3. Commiter

### 3. Render
1. New Web Service → connecter le repo GitHub
2. Build Command : `npm install`
3. Start Command : `node app.js`
4. **Variables d'environnement obligatoires :**

| Variable | Valeur |
|---|---|
| `SUPABASE_URL` | https://xxxx.supabase.co |
| `SUPABASE_KEY` | eyJxxxx... |
| `SESSION_SECRET` | chaine-aleatoire-longue |
| `NODE_ENV` | production |
| `ADMIN_PHONE` | 22799193823 |
| `ADMIN_MASTER_KEY` | ADMIN2026Bacniger |

5. Déployer → attendre le log de démarrage

---

## 🔐 CONNEXION ADMIN

| Champ | Valeur |
|---|---|
| Numéro | `22799193823` |
| Code | `ADMIN2026Bacniger` |

**Mécanisme :**
- Vérification AVANT toute requête DB (fallback total)
- Si DB down → l'admin se connecte quand même
- Code vérifié caractère par caractère côté backend
- Aucun identifiant exposé dans le HTML

---

## 📁 STRUCTURE

```
nigerbac_v6/
├── app.js                  # Point d'entrée
├── package.json
├── render.yaml
├── db/
│   ├── supabase.js         # Client DB robuste
│   └── schema.sql          # Tables + superadmin
├── routes/
│   ├── public.js           # Accueil, inscription, connexion
│   ├── dashboard.js        # Dashboard élève + outils
│   ├── flamme.js           # Chat La Flamme
│   └── admin.js            # Panel administrateur
├── middlewares/
│   └── auth.js             # requireUser, requireAdmin
├── data/
│   └── tools.js            # 16 outils (URLs masquées)
└── utils/
    ├── helpers.js          # Fonctions utilitaires
    └── styles.js           # CSS global
```

---

## 🔒 SÉCURITÉ
- Admin vérifié 100% backend (variables d'env)
- Rate limiting : 10 tentatives / 15 min
- Sessions httpOnly + sameSite
- Helmet (headers sécurité)
- Sanitisation XSS toutes entrées
- URLs outils jamais exposées au frontend
- Compression gzip activée
