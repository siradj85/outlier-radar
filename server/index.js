import express from "express";
import cors from "cors";
import { pool, initDb } from "./db.js";
import { encrypt, decrypt } from "./encrypt.js";

const app = express();
const PORT = process.env.PORT || 3001;
const YT = "https://www.googleapis.com/youtube/v3";
const MASTER_KEY = process.env.MASTER_YOUTUBE_API_KEY || "";
app.use(cors({ origin: true }));
app.use(express.json());

/* ─── Helpers ─── */
async function fetchJson(url) {
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "YouTube API Error");
  return d;
}

async function getUserApiKey(deviceToken) {
  const { rows } = await pool.query(
    "SELECT encrypted_key, iv, auth_tag FROM user_api_keys WHERE device_token = $1",
    [deviceToken]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  return decrypt(row.encrypted_key, row.iv, row.auth_tag);
}

/* GET /api/key — return whether user has a key stored */
app.get("/api/key", async (req, res) => {
  const token = req.headers["x-device-token"];
  if (!token) return res.json({ hasKey: false });
  const key = await getUserApiKey(token);
  res.json({ hasKey: !!key });
});

/* POST /api/key — store user's API key (encrypted) */
app.post("/api/key", async (req, res) => {
  try {
    const { deviceToken, apiKey } = req.body;
    if (!deviceToken || !apiKey) return res.status(400).json({ error: "Missing fields" });
    const { encrypted, iv, tag } = encrypt(apiKey);
    await pool.query(
      `INSERT INTO user_api_keys (device_token, encrypted_key, iv, auth_tag)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (device_token) DO UPDATE SET encrypted_key = $2, iv = $3, auth_tag = $4, last_used_at = NOW()`,
      [deviceToken, encrypted, iv, tag]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ─── Proxy routes ─── */
function getApiKey(req) {
  const userKey = req.headers["x-api-key"];
  if (userKey) return userKey;
  const token = req.headers["x-device-token"] || req.query.deviceToken;
  if (token) return null;
  return MASTER_KEY || null;
}

async function resolveKey(req) {
  let key = getApiKey(req);
  if (!key) {
    const token = req.headers["x-device-token"] || req.query.deviceToken;
    if (token) key = await getUserApiKey(token);
  }
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

    // Store in DB cache
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

/* GET /api/handle/:handle — resolves to { id } */
app.get("/api/handle/:handle", async (req, res) => {
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
app.get("/api/channel/:id", (req, res) => {
  const id = req.params.id;
  proxyToYouTube(req, res,
    (key) => `${YT}/channels?part=snippet,statistics&id=${id}&key=${key}`,
    id, "channel_cache"
  );
});

/* GET /api/search?q=... */
app.get("/api/search", (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Missing query" });
  proxyToYouTube(req, res,
    (key) => `${YT}/search?part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=15&key=${key}`,
    q, "search_cache"
  );
});

/* ─── Start ─── */
async function start() {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Niche Radar API running on http://localhost:${PORT}`);
  });
}
start();
