/* TubeRanke content script - injects an analytics overlay on YouTube.
   Features A (overlay stats + outlier score) and B (save to TubeRanke). */
(function () {
  const API = window.TubeRankeAPI;
  const P = window.TubeRankeParse;
  const PANEL_ID = "tuberanke-panel";
  let lastKey = null;

  const fmt = (n) => {
    n = Number(n) || 0;
    if (n >= 1e9) return (n / 1e9).toFixed(1) + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
    return String(Math.round(n));
  };

  function parseLocation() {
    const p = location.pathname;
    if (p.startsWith("/watch")) return { kind: "video" };
    const handleMatch = p.match(/^\/@([^\/]+)/);
    if (handleMatch) return { kind: "handle", handle: handleMatch[1] };
    const chMatch = p.match(/^\/channel\/([^\/]+)/);
    if (chMatch) return { kind: "channelId", id: chMatch[1] };
    return { kind: "other" };
  }

  function readVideoContext() {
    const ctx = {};
    const link =
      document.querySelector("ytd-video-owner-renderer a.yt-simple-endpoint") ||
      document.querySelector("#owner a.yt-simple-endpoint");
    if (link) {
      const href = link.getAttribute("href") || "";
      const m = href.match(/\/@([^\/]+)/) || href.match(/\/channel\/([^\/]+)/);
      if (m) {
        if (href.includes("/@")) ctx.handle = m[1];
        else ctx.channelId = m[1];
      }
    }
    const nodes = document.querySelectorAll(
      "ytd-watch-metadata #info-container span, ytd-watch-metadata #info span, #info-container yt-formatted-string, #info span"
    );
    for (const node of nodes) {
      const t = (node.textContent || "").trim();
      if (/(view|مشاهد|vue|visualizac)/i.test(t)) {
        const v = P ? P.parseCount(t) : null;
        if (v) { ctx.videoViews = v; break; }
      }
    }
    return ctx;
  }

  function channelMetrics(ch) {
    const s = ch.statistics || {};
    const subs = Number(s.subscriberCount) || 0;
    const views = Number(s.viewCount) || 0;
    const vids = Number(s.videoCount) || 0;
    const avgViews = vids > 0 ? views / vids : 0;
    const viewsPerSub = subs > 0 ? views / subs : 0;
    return { subs, views, vids, avgViews, viewsPerSub };
  }

  function outlierScore(videoViews, avgViews) {
    if (!videoViews || !avgViews) return null;
    return videoViews / avgViews;
  }

  function scoreLabel(x) {
    if (x == null) return { txt: "-", cls: "tr-mid" };
    if (x >= 5) return { txt: x.toFixed(1) + "x VIRAL", cls: "tr-hot" };
    if (x >= 2) return { txt: x.toFixed(1) + "x OUTLIER", cls: "tr-hot" };
    if (x >= 1) return { txt: x.toFixed(1) + "x above avg", cls: "tr-good" };
    return { txt: x.toFixed(2) + "x below avg", cls: "tr-mid" };
  }

  function ensurePanel() {
    let el = document.getElementById(PANEL_ID);
    if (el) return el;
    el = document.createElement("div");
    el.id = PANEL_ID;
    el.innerHTML =
      '<div class="tr-head">' +
      '<span class="tr-logo">TubeRanke</span>' +
      '<div class="tr-head-btns">' +
      '<button class="tr-min" title="Minimize">-</button>' +
      '<button class="tr-close" title="Hide">x</button>' +
      "</div></div>" +
      '<div class="tr-body"><div class="tr-loading">Loading...</div></div>';
    document.body.appendChild(el);
    el.querySelector(".tr-close").addEventListener("click", () => el.remove());
    el.querySelector(".tr-min").addEventListener("click", () => el.classList.toggle("tr-collapsed"));
    return el;
  }

  function renderLoggedOut() {
    const el = ensurePanel();
    el.querySelector(".tr-body").innerHTML =
      '<div class="tr-msg">Log in to your TubeRanke account to analyze this channel.</div>' +
      '<a class="tr-btn tr-primary" href="https://tuberanke.com" target="_blank">Open TubeRanke</a>' +
      '<div class="tr-hint">Click the TubeRanke icon in your toolbar to log in.</div>';
  }

  function renderError(msg) {
    const el = ensurePanel();
    el.querySelector(".tr-body").innerHTML = '<div class="tr-err">' + msg + "</div>";
  }

  function renderChannel(ch, videoViews, usage) {
    const el = ensurePanel();
    const m = channelMetrics(ch);
    const snip = ch.snippet || {};
    const title = snip.title || "Channel";
    const score = videoViews != null ? outlierScore(videoViews, m.avgViews) : null;
    const lbl = scoreLabel(score);

    const isFree = !usage || usage.plan === 'free' || usage.plan === 'logged-out';
    const usageLine = (usage && usage.plan === 'free' && usage.remaining != null)
      ? '<div class="tr-usage">' + usage.remaining + '/' + usage.limit + ' analyses left today</div>'
      : '';
    const upgradeLine = isFree
      ? '<a class="tr-btn tr-upgrade" href="https://tuberanke.com/app/upgrade" target="_blank">Unlock Pro - badges everywhere, sort & save</a>'
      : '';

    const outlierBlock = videoViews != null
      ? '<div class="tr-outlier ' + lbl.cls + '">' +
        '<div class="tr-outlier-num">' + lbl.txt + "</div>" +
        '<div class="tr-outlier-sub">this video (' + fmt(videoViews) + ") vs avg " + fmt(m.avgViews) + "</div>" +
        "</div>"
      : "";

    el.querySelector(".tr-body").innerHTML =
      usageLine +
      '<div class="tr-title">' + title + "</div>" +
      outlierBlock +
      '<div class="tr-grid">' +
      '<div class="tr-cell"><div class="tr-k">' + fmt(m.subs) + '</div><div class="tr-l">Subscribers</div></div>' +
      '<div class="tr-cell"><div class="tr-k">' + fmt(m.views) + '</div><div class="tr-l">Total views</div></div>' +
      '<div class="tr-cell"><div class="tr-k">' + fmt(m.vids) + '</div><div class="tr-l">Videos</div></div>' +
      '<div class="tr-cell"><div class="tr-k">' + fmt(m.avgViews) + '</div><div class="tr-l">Avg / video</div></div>' +
      "</div>" +
      '<div class="tr-ratio">Views per subscriber: <b>' + m.viewsPerSub.toFixed(1) + "x</b></div>" +
      (isFree
        ? upgradeLine
        : '<button class="tr-btn tr-primary tr-save">Save to TubeRanke</button>' +
          '<div class="tr-savemsg"></div>');

    const saveBtn = el.querySelector(".tr-save");
    const saveMsg = el.querySelector(".tr-savemsg");
    if (saveBtn) saveBtn.addEventListener("click", async () => {
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      try {
        await API.saveReport(title, {
          source: "extension",
          channelId: ch.id,
          title: title,
          metrics: m,
          videoViews: videoViews == null ? null : videoViews,
          outlier: score,
          url: location.href,
        });
        saveMsg.textContent = "Saved to your TubeRanke reports.";
        saveBtn.textContent = "Saved";
      } catch (e) {
        saveMsg.textContent = e.message;
        saveBtn.disabled = false;
        saveBtn.textContent = "Save to TubeRanke";
      }
    });
  }

  async function run() {
    const loc = parseLocation();
    if (loc.kind === "other") {
      const el = document.getElementById(PANEL_ID);
      if (el) el.remove();
      return;
    }

    const key = location.pathname + (loc.kind === "video" ? location.search : "");
    if (key === lastKey) return;
    lastKey = key;

    const token = await API.getToken();
    if (!token) { renderLoggedOut(); return; }

    ensurePanel();
    try {
      let channelId = null;
      let videoViews = null;

      if (loc.kind === "handle") {
        channelId = await API.channelIdFromHandle(loc.handle);
      } else if (loc.kind === "channelId") {
        channelId = loc.id;
      } else if (loc.kind === "video") {
        await new Promise((r) => setTimeout(r, 1400));
        const vc = readVideoContext();
        videoViews = vc.videoViews == null ? null : vc.videoViews;
        if (vc.channelId) channelId = vc.channelId;
        else if (vc.handle) channelId = await API.channelIdFromHandle(vc.handle);
      }

      if (!channelId) { renderError("Could not detect the channel on this page."); return; }
      const ch = await API.channelById(channelId);
      if (!ch) { renderError("Channel not found."); return; }

      let usage = null;
      try { usage = await API.getUsage(); } catch {}

      renderChannel(ch, videoViews, usage);
    } catch (e) {
      renderError(e.message);
    }
  }

  window.addEventListener("yt-navigate-finish", () => { lastKey = null; setTimeout(run, 400); });
  document.addEventListener("yt-page-data-updated", () => setTimeout(run, 400));
  setTimeout(run, 900);
})();
