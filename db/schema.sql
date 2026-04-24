-- ================================================================
-- BAC TOOLS NIGER 2026 v6 — Schema PostgreSQL / Supabase
-- Coller integralement dans SQL Editor de Supabase puis Run
-- ================================================================

-- TABLE USERS
CREATE TABLE IF NOT EXISTS users (
  id               BIGSERIAL PRIMARY KEY,
  nom              TEXT NOT NULL,
  prenom           TEXT NOT NULL,
  date_naissance   TEXT,
  ecole            TEXT NOT NULL,
  serie            TEXT NOT NULL,
  ville            TEXT NOT NULL,
  telephone        TEXT UNIQUE NOT NULL,
  code_acces       TEXT,
  code_anonyme     TEXT UNIQUE,
  role             TEXT NOT NULL DEFAULT 'eleve',
  paye             BOOLEAN NOT NULL DEFAULT FALSE,
  actif            BOOLEAN NOT NULL DEFAULT TRUE,
  recu_url         TEXT,
  inscrit_le       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  derniere_connexion TIMESTAMPTZ
);

-- TABLE TOOL_CLICKS
CREATE TABLE IF NOT EXISTS tool_clicks (
  id         BIGSERIAL PRIMARY KEY,
  user_id    BIGINT REFERENCES users(id) ON DELETE CASCADE,
  tool_id    INTEGER NOT NULL,
  tool_nom   TEXT,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE MESSAGES (chat La Flamme)
CREATE TABLE IF NOT EXISTS messages (
  id           BIGSERIAL PRIMARY KEY,
  user_id      BIGINT REFERENCES users(id) ON DELETE CASCADE,
  code_anonyme TEXT NOT NULL,
  contenu      TEXT,
  type         TEXT NOT NULL DEFAULT 'texte',
  media_url    TEXT,
  supprime     BOOLEAN NOT NULL DEFAULT FALSE,
  envoye_le    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TABLE LOGS
CREATE TABLE IF NOT EXISTS logs (
  id       BIGSERIAL PRIMARY KEY,
  user_id  BIGINT REFERENCES users(id) ON DELETE SET NULL,
  action   TEXT NOT NULL,
  details  TEXT,
  ip       TEXT,
  cree_le  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEX PERFORMANCES
CREATE INDEX IF NOT EXISTS idx_users_telephone  ON users(telephone);
CREATE INDEX IF NOT EXISTS idx_users_role       ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_paye       ON users(paye);
CREATE INDEX IF NOT EXISTS idx_messages_envoye  ON messages(envoye_le);
CREATE INDEX IF NOT EXISTS idx_tool_clicks_tool ON tool_clicks(tool_id);
CREATE INDEX IF NOT EXISTS idx_logs_cree        ON logs(cree_le);

-- ================================================================
-- SUPERADMIN — insertion/mise a jour
-- Telephone : 22799193823
-- Code      : ADMIN2026Bacniger  (stocke en clair, verifie backend)
-- ================================================================
INSERT INTO users (
  nom, prenom, ecole, serie, ville,
  telephone, role, paye, actif, code_acces, code_anonyme
) VALUES (
  'ADMIN', 'Super',
  'BAC TOOLS NIGER', 'Terminale D', 'Niamey',
  '22799193823',
  'superadmin', TRUE, TRUE,
  'ADMIN2026Bacniger',
  'ADMIN999'
)
ON CONFLICT (telephone) DO UPDATE SET
  role       = 'superadmin',
  paye       = TRUE,
  actif      = TRUE,
  code_acces = 'ADMIN2026Bacniger';
