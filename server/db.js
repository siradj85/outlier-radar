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

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  data TEXT,
  share_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS niche_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  request TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
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

-- Add PayPal subscription id if missing
ALTER TABLE users ADD COLUMN IF NOT EXISTS paypal_subscription_id TEXT;

-- Track whether a user was synced to tinyEmail
ALTER TABLE users ADD COLUMN IF NOT EXISTS synced_to_tinyemail BOOLEAN DEFAULT FALSE;
`;

const DEFAULT_AFFILIATE_TOOLS = [
  { name: "VidIQ", description_en: "YouTube keyword research & channel optimization tool", description_ar: "أداة أبحاث الكلمات المفتاحية وتحسين القنوات على يوتيوب", url: "https://vidiq.com/", badge: "Popular" },
  { name: "TubeBuddy", description_en: "Browser extension for YouTube channel management", description_ar: "إضافة للمتصفح لإدارة قنوات يوتيوب", url: "https://www.tubebuddy.com/", badge: "Top Rated" },
  { name: "Canva", description_en: "Easy thumbnail & graphic design for creators", description_ar: "تصميم صور مصغرة ورسوميات بسهولة لصناع المحتوى", url: "https://www.canva.com/", badge: "" },
  { name: "Morningfame", description_en: "YouTube analytics & growth insights", description_ar: "تحليلات يوتيوب ورؤى النمو", url: "https://morningfa.me/", badge: "" },
  { name: "Social Blade", description_en: "Social media statistics & channel tracking", description_ar: "إحصائيات التواصل الاجتماعي وتتبع القنوات", url: "https://socialblade.com/", badge: "" },
  { name: "Repurpose.io", description_en: "Auto repurpose videos to shorts, reels & more", description_ar: "إعادة استخدام الفيديوهات تلقائياً لشورتس وريلز وأكثر", url: "https://repurpose.io/", badge: "New" },
];

const DEFAULT_DISCOVERIES = [
  {
    title_en: "Stoic Philosophy Shorts", title_ar: "شورتس الفلسفة الرواقية",
    niche: "Self-improvement / Philosophy", metrics: "Faceless · ~$10 RPM · rising",
    difficulty: "easy", channel_url: "", image: "",
    reasons_en: "Faceless, reusable public-domain quotes, high watch-time on Shorts, and a young true-niche age (most channels started < 12 months ago) — strong algorithm push with low competition.",
    reasons_ar: "بدون وجه، اقتباسات من الملك العام قابلة لإعادة الاستخدام، وقت مشاهدة عالٍ في الشورتس، وعمر نتش حقيقي صغير (معظم القنوات بدأت قبل أقل من 12 شهراً) — دفع قوي من الخوارزمية بمنافسة منخفضة.",
  },
  {
    title_en: "AI Tools for Small Business", title_ar: "أدوات الذكاء الاصطناعي للأعمال الصغيرة",
    niche: "Tech / Business", metrics: "High RPM ($15-25) · growing demand",
    difficulty: "medium", channel_url: "", image: "",
    reasons_en: "Very high RPM tech+business audience, constant stream of new tools to cover (evergreen + trending), and many channels pivoted in recently — a clear momentum signal.",
    reasons_ar: "جمهور تقني وأعمال بـ RPM مرتفع جداً، وتدفّق مستمر من أدوات جديدة للتغطية (دائم + رائج)، وقنوات كثيرة دخلت النتش حديثاً — إشارة زخم واضحة.",
  },
];

const DEFAULT_SETTINGS = {
  free_daily_limit: String(FREE_DAILY_LIMIT),
  trial_days: String(TRIAL_DAYS),
  pro_price: "9",
  adsense_client: "",
  adsense_slot: "",
  ads_enabled: "true",
  contact_email: "support@tuberanke.com",
  ga_measurement_id: "",
  logo_url: "",
  marketing_head: "",
  ads: "[]",
  affiliate_tools: JSON.stringify(DEFAULT_AFFILIATE_TOOLS),
  discoveries: JSON.stringify(DEFAULT_DISCOVERIES),
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
