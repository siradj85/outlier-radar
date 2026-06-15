import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env") });

import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
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
`;

async function initDb() {
  await pool.query(SCHEMA);
  await pool.query(MIGRATIONS);
  console.log("DB schema ready");
}

export { pool, initDb };
