/* TubeRanke popup - login + niche search + discoveries (feature C).
   Talks to background.js via runtime messaging. */
const ext = typeof browser !== "undefined" ? browser : chrome;

function send(msg) {
  return new Promise((resolve, reject) => {
    ext.runtime.sendMessage(msg, (res) => {
      const err = ext.runtime.lastError;
      if (err) return reject(new Error(err.message));
      if (!res) return reject(new Error("No response"));
      if (res.ok) resolve(res.data);
      else reject(new Error(res.error || "Request failed"));
    });
  });
}

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- view switching ---------- */
function showLogin() {
  $("view-login").hidden = false;
  $("view-main").hidden = true;
  $("plan").textContent = "";
}
function showMain(user) {
  $("view-login").hidden = true;
  $("view-main").hidden = false;
  $("userEmail").textContent = user.email;
  $("plan").textContent = (user.plan || "free").toUpperCase();
}

/* ---------- init ---------- */
async function init() {
  try {
    const token = await send({ type: "getToken" });
    if (!token) return showLogin();
    const user = await send({ type: "me" });
    showMain(user);
  } catch {
    showLogin();
  }
}

/* ---------- login ---------- */
$("loginBtn").addEventListener("click", async () => {
  const email = $("email").value.trim();
  const password = $("password").value;
  $("loginErr").textContent = "";
  if (!email || !password) { $("loginErr").textContent = "Enter email and password."; return; }
  $("loginBtn").disabled = true;
  $("loginBtn").textContent = "Logging in...";
  try {
    const user = await send({ type: "login", email, password });
    showMain(user);
  } catch (e) {
    $("loginErr").textContent = e.message;
  } finally {
    $("loginBtn").disabled = false;
    $("loginBtn").textContent = "Log in";
  }
});
$("password").addEventListener("keydown", (e) => { if (e.key === "Enter") $("loginBtn").click(); });

$("logoutBtn").addEventListener("click", async () => {
  await send({ type: "logout" });
  showLogin();
});

/* ---------- tabs ---------- */
document.querySelectorAll(".tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((x) => x.classList.remove("active"));
    t.classList.add("active");
    const tab = t.dataset.tab;
    $("tab-search").hidden = tab !== "search";
    $("tab-discover").hidden = tab !== "discover";
    if (tab === "discover" && !$("discoverResults").dataset.loaded) loadDiscoveries();
  });
});

/* ---------- niche search (feature C) ---------- */
function channelCard(item) {
  const sn = item.snippet || {};
  const cid = (item.id && (item.id.channelId || item.id)) || sn.channelId || "";
  const thumb = (sn.thumbnails && (sn.thumbnails.default || sn.thumbnails.medium) || {}).url || "";
  const url = cid ? "https://www.youtube.com/channel/" + cid : "https://www.youtube.com";
  return `
    <div class="card">
      <a href="${esc(url)}" target="_blank">
        ${thumb ? `<img src="${esc(thumb)}" alt="">` : ""}
        <div>
          <div class="c-title">${esc(sn.title || sn.channelTitle || "Channel")}</div>
          <div class="c-desc">${esc(sn.description || "")}</div>
        </div>
      </a>
    </div>`;
}

async function doSearch() {
  const q = $("q").value.trim();
  if (!q) return;
  const box = $("searchResults");
  box.innerHTML = `<div class="muted">Searching...</div>`;
  try {
    const items = await send({ type: "search", q });
    box.innerHTML = items.length
      ? items.map(channelCard).join("")
      : `<div class="muted">No channels found.</div>`;
  } catch (e) {
    if (/pro_feature|Pro users/i.test(e.message)) {
      box.innerHTML = `<div class="upsell">Niche search is a Pro feature.
        <a href="https://tuberanke.com" target="_blank">Upgrade on tuberanke.com</a></div>`;
    } else {
      box.innerHTML = `<div class="muted">${esc(e.message)}</div>`;
    }
  }
}
$("searchBtn").addEventListener("click", doSearch);
$("q").addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

/* ---------- discoveries (feature C) ---------- */
function discoveryCard(d) {
  const title = d.title || d.niche || d.name || "Discovery";
  const desc = d.description || d.note || d.reason || "";
  const url = d.url || d.link || "";
  const inner = `
    <div>
      <div class="c-title">${esc(title)}</div>
      <div class="c-desc">${esc(desc)}</div>
    </div>`;
  return `<div class="card">${url ? `<a href="${esc(url)}" target="_blank">${inner}</a>` : inner}</div>`;
}

async function loadDiscoveries() {
  const box = $("discoverResults");
  box.innerHTML = `<div class="muted">Loading discoveries...</div>`;
  try {
    const list = await send({ type: "discoveries" });
    box.dataset.loaded = "1";
    box.innerHTML = list.length
      ? list.map(discoveryCard).join("")
      : `<div class="muted">No discoveries yet. Check back soon.</div>`;
  } catch (e) {
    if (/pro_feature|Pro users/i.test(e.message)) {
      box.innerHTML = `<div class="upsell">Discoveries are a Pro feature.
        <a href="https://tuberanke.com" target="_blank">Upgrade on tuberanke.com</a></div>`;
    } else {
      box.innerHTML = `<div class="muted">${esc(e.message)}</div>`;
    }
  }
}

init();
