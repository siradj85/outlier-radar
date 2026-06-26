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

/* ---------- discoveries: auto-discover rising outliers (feature C) ---------- */
const fmt = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return String(Math.round(n));
};

function outlierCard(d) {
  const mult = d.outlier || 0;
  const cls = mult >= 5 ? "b-viral" : mult >= 2 ? "b-hot" : mult >= 1 ? "b-good" : "b-mid";
  return `
    <div class="card">
      <a href="${esc(d.url)}" target="_blank">
        ${d.thumb ? `<img class="thumb" src="${esc(d.thumb)}" alt="">` : ""}
        <div class="grow">
          <div class="c-title">${esc(d.title || "")}</div>
          <div class="c-desc">${esc(d.channel || "")} &middot; ${fmt(d.subs)} subs</div>
          <div class="metarow">
            <span class="pill ${cls}">${mult.toFixed(1)}x</span>
            <span class="views">${fmt(d.views)} views</span>
          </div>
        </div>
      </a>
    </div>`;
}

async function doDiscover() {
  const q = $("dq").value.trim();
  if (!q) return;
  const box = $("discoverResults");
  box.innerHTML = `<div class="muted">Scanning the niche for rising outliers...</div>`;
  try {
    const list = await send({ type: "discover", q });
    box.innerHTML = list.length
      ? list.map(outlierCard).join("")
      : `<div class="muted">No rising outliers found for this niche.</div>`;
  } catch (e) {
    if (/pro_feature|Pro users/i.test(e.message)) {
      box.innerHTML = `<div class="upsell">Discoveries are a Pro feature.
        <a href="https://tuberanke.com" target="_blank">Upgrade on tuberanke.com</a></div>`;
    } else {
      box.innerHTML = `<div class="muted">${esc(e.message)}</div>`;
    }
  }
}
$("discoverBtn").addEventListener("click", doDiscover);
$("dq").addEventListener("keydown", (e) => { if (e.key === "Enter") doDiscover(); });

init();
