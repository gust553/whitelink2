-- WhiteLink — banco de dados (Cloudflare D1)
-- Cole tudo isto no console do D1 uma vez. Pode rodar de novo sem problema.

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  phone TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  pass_salt TEXT NOT NULL,
  name TEXT NOT NULL,
  instagram TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'prata',          -- plano pago: prata, ouro, diamante
  plan_until INTEGER,                          -- fim do plano pago (ms)
  trial_until INTEGER,                         -- fim do teste Diamante (ms)
  ref_code TEXT UNIQUE,
  referred_by INTEGER,
  status TEXT NOT NULL DEFAULT 'ativo',        -- ativo, suspenso, bloqueado
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  ip TEXT,
  ua TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS sms_codes (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  purpose TEXT NOT NULL,                       -- signup, reset
  code_hash TEXT NOT NULL,
  payload TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Guarda para sempre quem já usou o teste grátis (mesmo se a conta for apagada)
CREATE TABLE IF NOT EXISTS trial_registry (
  kind TEXT NOT NULL,                          -- email, phone, instagram, device
  value_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (kind, value_hash)
);

CREATE TABLE IF NOT EXISTS links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  clicks INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_links_user ON links(user_id, position);

CREATE TABLE IF NOT EXISTS profiles (
  user_id INTEGER PRIMARY KEY,
  title TEXT,
  bio TEXT,
  theme TEXT NOT NULL DEFAULT 'noite',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS visits (
  user_id INTEGER NOT NULL,
  day TEXT NOT NULL,                           -- AAAA-MM-DD
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
