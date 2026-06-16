import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env") });

import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const FREE_DAILY_LIMIT = 10;
const TRIAL_DAYS = 3;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  trial_ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usage_daily (
  user_id UUID REFERENCES users(id),
  usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, usage_date)
);

CREATE TABLE IF NOT EXISTS channel_cache (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS handle_cache (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS search_cache (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  cached_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_resets (
  email TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_resets_email_code ON password_resets(email, code);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

const MIGRATIONS = `
-- Migrate user_api_keys: add user_id column, drop device_token uniqueness
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
ALTER TABLE user_api_keys ALTER COLUMN device_token DROP NOT NULL;
ALTER TABLE user_api_keys DROP CONSTRAINT IF EXISTS user_api_keys_device_token_key;

-- Add unique constraint on user_id (PG allows multiple NULLs)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_api_keys_user_id_key') THEN
    ALTER TABLE user_api_keys ADD CONSTRAINT user_api_keys_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Add plan column if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';

-- Add trial_ends_at column if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
`;

const DEFAULT_SETTINGS = {
  free_daily_limit: String(FREE_DAILY_LIMIT),
  trial_days: String(TRIAL_DAYS),
  pro_price: "9",
};

async function initDb() {
  await pool.query(SCHEMA);
  await pool.query(MIGRATIONS);
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    await pool.query(
      "INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING",
      [k, v]
    );
  }
  console.log("DB schema ready");
}

export { pool, initDb };
