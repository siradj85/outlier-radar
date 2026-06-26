/* TubeRanke background service worker (MV3).
   Owns all network + token storage. Exempt from CORS for host_permissions. */

const API_BASE = "https://niche-radar-api.onrender.com";
const ext = typeof browser !== "undefined" ? browser : chrome;

/* ---- storage helpers ---- */
function get(keys) {
  return new Promise((resolve) => ext.storage.local.get(keys, resolve));
}
function set(obj) {
  return new Promise((resolve) => ext.storage.local.set(obj, resolve));
}
function remove(keys) {
  return new Promise((resolve) => ext.storage.local.remove(keys, resolve));
}

/* ---- core request ---- */
async function request(method, path, body) {
  const { tr_token } = await get(["tr_token"]);
  const headers = {};
  if (tr_token) headers["Authorization"] = "Bearer " + tr_token;
  if (body) headers["Content-Type"] = "application/json";

  const r = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (r.status === 401) {
    await remove(["tr_token", "tr_user"]);
    throw new Error("Session expired. Please log in again.");
  }

  let d;
  try { d = await r.json(); } catch { d = {}; }
  if (!r.ok || d.error) {
    throw new Error(d.message || d.error || ("Request failed (" + r.status + ")"));
  }
  return d;
}

/* ---- message handlers ---- */
const handlers = {
  async getToken() {
    const { tr_token } = await get(["tr_token"]);
    return tr_token || null;
  },
  async getUser() {
    const { tr_user } = await get(["tr_user"]);
    return tr_user || null;
  },
  async login({ email, password }) {
    const d = await request("POST", "/api/auth/login", { email, password });
    await set({ tr_token: d.token, tr_user: d.user });
    return d.user;
  },
  async me() {
    const d = await request("GET", "/api/auth/me");
    await set({ tr_user: d.user });
    return d.user;
  },
  async logout() {
    await remove(["tr_token", "tr_user"]);
    return true;
  },
  async channelIdFromHandle({ handle }) {
    const h = String(handle || "").replace(/^@/, "");
    const d = await request("GET", "/api/handle/" + encodeURIComponent(h));
    return d.id;
  },
  async channelById({ id }) {
    const d = await request("GET", "/api/channel/" + encodeURIComponent(id));
    return (d.items && d.items[0]) || null;
  },
  async search({ q }) {
    const d = await request("GET", "/api/search?q=" + encodeURIComponent(q));
    return d.items || [];
  },
  async discoveries() {
    const d = await request("GET", "/api/discoveries");
    return d.discoveries || [];
  },
  async discover({ q }) {
    const d = await request("GET", "/api/discover?q=" + encodeURIComponent(q));
    return d.discoveries || [];
  },
  async saveReport({ title, data }) {
    return request("POST", "/api/reports", { title, data });
  },
};

ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const fn = handlers[msg && msg.type];
  if (!fn) {
    sendResponse({ ok: false, error: "Unknown message type: " + (msg && msg.type) });
    return false;
  }
  fn(msg)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true; // keep the channel open for async response
});
