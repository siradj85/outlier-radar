import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "..", ".env") });
import express from "express";
import cors from "cors";
import { pool, initDb } from "./db.js";
import { encrypt, decrypt } from "./encrypt.js";
import { hashPassword, comparePassword, signToken, requireAuth } from "./auth.js";

const app = express();
const PORT = process.env.PORT || 3001;
const YT = "https://www.googleapis.com/youtube/v3";
const MASTER_KEY = process.env.MASTER_YOUTUBE_API_KEY || "";
const RAW = process.env.CORS_ORIGIN || "https://siradj85.github.io,https://tuberanke.com";
const CORS_ORIGINS = RAW.split(",").map(s => s.trim());
app.use(cors({ origin: CORS_ORIGINS }));
app.use(express.json());

/* ─── Helpers ─── */
async function fetchJson(url) {
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "YouTube API Error");
  return d;
}

async function getUserApiKey(userId) {
  const { rows } = await pool.query(
    "SELECT encrypted_key, iv, auth_tag FROM user_api_keys WHERE user_id = $1",
    [userId]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return decrypt(row.encrypted_key, row.iv, row.auth_tag);
}

/* ─── Auth ─── */

/* POST /api/auth/register */
app.post("/api/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: "Email already registered" });

    const password_hash = await hashPassword(password);
    const { rows } = await pool.query(
      "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at",
      [email, password_hash]
    );
    const user = rows[0];
    const token = signToken(user);
    res.status(201).json({ token, user: { id: user.id, email: user.email, created_at: user.created_at } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* POST /api/auth/login */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Missing email or password" });

    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (rows.length === 0) return res.status(401).json({ error: "Invalid email or password" });

    const user = rows[0];
    const valid = await comparePassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });

    const token = signToken(user);
    res.json({ token, user: { id: user.id, email: user.email, created_at: user.created_at } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* GET /api/auth/me */
app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({ user: { id: req.user.userId, email: req.user.email } });
});

/* ─── BYOK (Authenticated) ─── */

/* GET /api/key — whether current user has a stored API key */
app.get("/api/key", requireAuth, async (req, res) => {
  const key = await getUserApiKey(req.user.userId);
  res.json({ hasKey: !!key });
});

/* POST /api/key — store/update user's own API key */
app.post("/api/key", requireAuth, async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey) return res.status(400).json({ error: "Missing apiKey" });
    const { encrypted, iv, tag } = encrypt(apiKey);
    await pool.query(
      `INSERT INTO user_api_keys (user_id, encrypted_key, iv, auth_tag)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id)
       DO UPDATE SET encrypted_key = $2, iv = $3, auth_tag = $4, last_used_at = NOW()`,
      [req.user.userId, encrypted, iv, tag]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── Proxy routes (Authenticated) ─── */

function getApiKey(req) {
  const userKey = req.headers["x-api-key"];
  if (userKey) return userKey;
  return null;
}

async function resolveKey(req) {
  let key = getApiKey(req);
  if (!key) key = await getUserApiKey(req.user.userId);
  if (!key) key = MASTER_KEY || null;
  return key;
}

async function proxyToYouTube(req, res, urlBuilder, cacheKey, cacheTable) {
  try {
    if (cacheTable && cacheKey) {
      const { rows } = await pool.query(
        `SELECT data, cached_at FROM ${cacheTable} WHERE id = $1 AND cached_at > NOW() - INTERVAL '24 hours'`,
        [cacheKey]
      );
      if (rows.length > 0) return res.json(rows[0].data);
    }

    const apiKey = await resolveKey(req);
    if (!apiKey) return res.status(400).json({ error: "No API key available. Set your key first." });

    const url = urlBuilder(apiKey);
    const data = await fetchJson(url);

    if (cacheTable && cacheKey) {
      await pool.query(
        `INSERT INTO ${cacheTable} (id, data) VALUES ($1, $2::jsonb)
         ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, cached_at = NOW()`,
        [cacheKey, JSON.stringify(data)]
      );
    }

    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
}

/* GET /api/handle/:handle */
app.get("/api/handle/:handle", requireAuth, async (req, res) => {
  try {
    const h = req.params.handle;
    const { rows } = await pool.query(
      "SELECT data FROM handle_cache WHERE id = $1 AND cached_at > NOW() - INTERVAL '24 hours'",
      [h]
    );
    if (rows.length > 0) return res.json(rows[0].data);

    const apiKey = await resolveKey(req);
    if (!apiKey) return res.status(400).json({ error: "No API key available" });

    const r = await fetchJson(`${YT}/channels?part=snippet&forHandle=${encodeURIComponent(h)}&key=${apiKey}`);
    if (!r.items || !r.items.length) return res.status(404).json({ error: "Channel not found" });
    const result = { id: r.items[0].id };
    await pool.query(
      "INSERT INTO handle_cache (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = $2::jsonb, cached_at = NOW()",
      [h, JSON.stringify(result)]
    );
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* GET /api/channel/:id */
app.get("/api/channel/:id", requireAuth, (req, res) => {
  const id = req.params.id;
  proxyToYouTube(req, res,
    (key) => `${YT}/channels?part=snippet,statistics&id=${id}&key=${key}`,
    id, "channel_cache"
  );
});

/* GET /api/search?q=... */
app.get("/api/search", requireAuth, (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Missing query" });
  proxyToYouTube(req, res,
    (key) => `${YT}/search?part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=15&key=${key}`,
    q, "search_cache"
  );
});

/* ─── Password Reset ─── */

const RESET_CODE_EXPIRY = 60 * 60 * 1000; // 1 hour
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || "noreply@tuberanke.com";

function generateCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function sendEmail(to, subject, text) {
  if (!SMTP_HOST || !SMTP_USER) {
    console.log(`[DEV] Password reset email to ${to}: ${subject} — ${text}`);
    return;
  }
  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.default.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
    await transport.sendMail({ from: SMTP_FROM, to, subject, text });
  } catch (e) {
    console.error("Failed to send email:", e.message);
  }
}

/* POST /api/auth/forgot */
app.post("/api/auth/forgot", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Missing email" });

    const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (rows.length === 0) return res.json({ ok: true }); // Don't reveal if email exists

    const code = generateCode();
    await pool.query(
      "INSERT INTO password_resets (email, code, expires_at) VALUES ($1, $2, NOW() + INTERVAL '1 hour')",
      [email, code]
    );

    const subject = "Niche Radar — Password Reset Code";
    const text = `Your password reset code is: ${code}\n\nThis code expires in 1 hour.\n\nIf you didn't request this, please ignore this email.`;
    await sendEmail(email, subject, text);

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* POST /api/auth/reset */
app.post("/api/auth/reset", async (req, res) => {
  try {
    const { email, code, password } = req.body;
    if (!email || !code || !password) return res.status(400).json({ error: "Missing fields" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const { rows } = await pool.query(
      `SELECT id FROM password_resets
       WHERE email = $1 AND code = $2 AND used = FALSE AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [email, code]
    );
    if (rows.length === 0) return res.status(400).json({ error: "Invalid or expired reset code" });

    const password_hash = await hashPassword(password);
    await pool.query("UPDATE users SET password_hash = $1 WHERE email = $2", [password_hash, email]);
    await pool.query("UPDATE password_resets SET used = TRUE WHERE id = $1", [rows[0].id]);

    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── Start ─── */
async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Niche Radar API running on http://localhost:${PORT}`);
  });
}
start();
