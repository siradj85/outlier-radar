import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;
const API_KEY = process.env.VITE_YOUTUBE_API_KEY || "";
const YT = "https://www.googleapis.com/youtube/v3";

if (!API_KEY) {
  console.error("Missing VITE_YOUTUBE_API_KEY in .env");
  process.exit(1);
}

/* ─── Cache (in-memory, 1 hour TTL) ─── */
const cache = new Map();
function getCache(k) {
  const item = cache.get(k);
  if (item && Date.now() - item.ts < 3600000) return item.data;
  return null;
}
function setCache(k, data) { cache.set(k, { ts: Date.now(), data }); }

app.use(cors({ origin: true }));
app.use(express.json());

async function fetchJson(url) {
  const r = await fetch(url);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "YouTube API Error");
  return d;
}

/* GET /api/search?q=...  (keyword search — expensive: 100 units) */
app.get("/api/search", async (req, res) => {
  try {
    const q = req.query.q;
    if (!q) return res.status(400).json({ error: "Missing query" });

    const cached = getCache("s:" + q);
    if (cached) return res.json(cached);

    const url = `${YT}/search?part=snippet&q=${encodeURIComponent(q)}&type=channel&maxResults=15&key=${API_KEY}`;
    const data = await fetchJson(url);
    setCache("s:" + q, data);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* GET /api/handle/:handle  (resolve handle to channel id) */
app.get("/api/handle/:handle", async (req, res) => {
  try {
    const h = req.params.handle;
    const cached = getCache("h:" + h);
    if (cached) return res.json({ id: cached });

    const url = `${YT}/channels?part=snippet&forHandle=${encodeURIComponent(h)}&key=${API_KEY}`;
    const data = await fetchJson(url);
    if (data.items && data.items.length) {
      setCache("h:" + h, data.items[0].id);
      return res.json({ id: data.items[0].id });
    }
    res.status(404).json({ error: "Channel not found" });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* GET /api/channel/:id  (channel snippet + statistics) */
app.get("/api/channel/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const cached = getCache("ch:" + id);
    if (cached) return res.json(cached);

    const url = `${YT}/channels?part=snippet,statistics&id=${id}&key=${API_KEY}`;
    const data = await fetchJson(url);
    setCache("ch:" + id, data);
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`Niche Radar API running on http://localhost:${PORT}`);
});
