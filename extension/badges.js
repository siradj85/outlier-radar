/* TubeRanke outlier badges - injects an outlier/VPH badge on every YouTube
   thumbnail. Pure client-side math (no API quota). On single-channel pages it
   shows a true outlier multiplier vs the channel's median; elsewhere it shows
   views-per-hour momentum. Clicking a badge saves the idea to TubeRanke. */
(function () {
  const P = window.TubeRankeParse;
  const API = window.TubeRankeAPI;
  const BADGE = "tr-badge";
  const DONE = "data-tr-done";

  const fmt = (n) => {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
    return String(Math.round(n));
  };

  // selectors for the various thumbnail containers YouTube uses
  const ITEM_SELECTORS = [
    "ytd-rich-item-renderer",
    "ytd-video-renderer",
    "ytd-grid-video-renderer",
    "ytd-compact-video-renderer",
    "ytd-reel-item-renderer",
  ].join(",");

  function isChannelPage() {
    const p = location.pathname;
    return /^\/@[^/]+/.test(p) || /^\/channel\//.test(p) || /^\/c\//.test(p) || /^\/user\//.test(p);
  }

  // pull views + age + title + url from one item element
  function readItem(el) {
    const out = {};
    // metadata spans hold "views" and "age" (new view-model layout + legacy)
    const spans = el.querySelectorAll(
      ".ytContentMetadataViewModelMetadataText, #metadata-line span, .inline-metadata-item"
    );
    const texts = [];
    spans.forEach((s) => { const t = (s.textContent || "").trim(); if (t) texts.push(t); });

    for (const t of texts) {
      if (out.views == null && /(view|مشاهد|vue|visualizac)/i.test(t)) out.views = P.parseCount(t);
      if (out.ageH == null && /(ago|قبل|hace|il y a|前)/i.test(t)) out.ageH = P.parseAgeHours(t);
    }
    // fallback: first numeric span = views
    if (out.views == null && texts.length) out.views = P.parseCount(texts[0]);
    if (out.ageH == null && texts.length > 1) out.ageH = P.parseAgeHours(texts[1]);

    const link = el.querySelector("a#video-title, a#video-title-link, a.yt-simple-endpoint#video-title, a[href*='/watch']");
    if (link) {
      out.url = link.href || ("https://www.youtube.com" + (link.getAttribute("href") || ""));
      out.title = (link.getAttribute("title") || link.textContent || "").trim();
    }
    return out;
  }

  function thumbHost(el) {
    return el.querySelector("yt-thumbnail-view-model")
      || el.querySelector("ytd-thumbnail")
      || el.querySelector("#thumbnail")
      || el;
  }

  function colorFor(mult) {
    if (mult >= 5) return "tr-b-viral";
    if (mult >= 2) return "tr-b-hot";
    if (mult >= 1) return "tr-b-good";
    return "tr-b-mid";
  }

  function makeBadge(label, sub, cls, data) {
    const b = document.createElement("div");
    b.className = BADGE + " " + cls;
    b.innerHTML = `<span class="tr-b-main">${label}</span>` + (sub ? `<span class="tr-b-sub">${sub}</span>` : "");
    b.title = "Click to save this idea to TubeRanke";
    b.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      saveIdea(b, data);
    });
    return b;
  }

  async function saveIdea(b, data) {
    const old = b.innerHTML;
    b.innerHTML = `<span class="tr-b-main">...</span>`;
    try {
      const token = await API.getToken();
      if (!token) { toast("Log in (toolbar icon) to save ideas"); b.innerHTML = old; return; }
      await API.saveReport("Idea: " + (data.title || "video").slice(0, 80), {
        source: "extension-idea",
        title: data.title, url: data.url,
        views: data.views, ageHours: data.ageH,
        metric: data.metricLabel, value: data.metricValue,
      });
      b.innerHTML = `<span class="tr-b-main">Saved</span>`;
      toast("Saved to TubeRanke");
      setTimeout(() => { b.innerHTML = old; }, 1500);
    } catch (e) {
      toast(e.message); b.innerHTML = old;
    }
  }

  let toastEl;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.id = "tr-toast";
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  /* ---- channel-page baseline (median of currently visible videos) ---- */
  let channelMedian = null;
  function recomputeChannelMedian(items) {
    const counts = [];
    items.forEach((el) => {
      const d = readItem(el);
      if (d.views) counts.push(d.views);
    });
    channelMedian = P.median(counts);
  }

  function scan() {
    const items = Array.from(document.querySelectorAll(ITEM_SELECTORS));
    if (!items.length) return;
    const channelMode = isChannelPage();
    if (channelMode) recomputeChannelMedian(items);

    items.forEach((el) => {
      if (el.getAttribute(DONE) === (channelMode ? "ch" : "vph")) return;
      const d = readItem(el);
      if (!d.views) return;

      let label, sub, cls, data;
      if (channelMode && channelMedian) {
        const mult = d.views / channelMedian;
        if (!isFinite(mult)) return;
        label = mult.toFixed(1) + "x";
        sub = "vs median";
        cls = colorFor(mult);
        data = { ...d, metricLabel: "outlier", metricValue: mult };
      } else {
        if (!d.ageH || d.ageH <= 0) return;
        const vph = d.views / d.ageH;
        // momentum color: scale by absolute VPH
        let mcls = "tr-b-mid";
        if (vph >= 5000) mcls = "tr-b-viral";
        else if (vph >= 1000) mcls = "tr-b-hot";
        else if (vph >= 100) mcls = "tr-b-good";
        label = fmt(vph) + "/h";
        sub = "views/hr";
        cls = mcls;
        data = { ...d, metricLabel: "vph", metricValue: vph };
      }

      // store the metric so we can sort the grid by it
      el.setAttribute("data-tr-metric", String(data.metricValue));

      // remove any previous badge (mode switched)
      el.querySelectorAll("." + BADGE).forEach((x) => x.remove());
      const host = thumbHost(el);
      if (getComputedStyle(host).position === "static") host.style.position = "relative";
      host.appendChild(makeBadge(label, sub, cls, data));
      el.setAttribute(DONE, channelMode ? "ch" : "vph");
    });

    if (channelMode) {
      ensureSortButton();
      if (sorted) applySortOrder(); // keep newly-loaded items in sorted position
    }
  }

  /* ---- sort the channel grid by our outlier metric ----
     Uses CSS `order` on the flex #contents grid instead of moving nodes:
     YouTube's framework reverts DOM reordering, but it leaves CSS order
     alone, and not moving nodes means our badges are never wiped. */
  const ALL_ITEMS = "ytd-rich-item-renderer, ytd-grid-video-renderer";
  let sortBtn, sorted = false;

  function ensureSortButton() {
    if (sortBtn && document.body.contains(sortBtn)) return;
    sortBtn = document.createElement("button");
    sortBtn.id = "tr-sort-btn";
    sortBtn.textContent = sorted ? "Original order" : "Sort by Outlier";
    if (sorted) sortBtn.classList.add("tr-active");
    sortBtn.addEventListener("click", toggleSort);
    document.body.appendChild(sortBtn);
  }

  function applySortOrder() {
    const items = Array.from(document.querySelectorAll(ALL_ITEMS));
    const withMetric = items.filter((el) => el.hasAttribute("data-tr-metric"));
    withMetric.sort((a, b) => parseFloat(b.getAttribute("data-tr-metric")) - parseFloat(a.getAttribute("data-tr-metric")));
    withMetric.forEach((el, i) => { el.style.order = String(i); });
    items.filter((el) => !el.hasAttribute("data-tr-metric")).forEach((el) => { el.style.order = "9999"; });
  }

  function clearSortOrder() {
    document.querySelectorAll(ALL_ITEMS).forEach((el) => { el.style.order = ""; });
  }

  function toggleSort() {
    if (!sorted) {
      sorted = true;
      applySortOrder();
      sortBtn.textContent = "Original order";
      sortBtn.classList.add("tr-active");
    } else {
      sorted = false;
      clearSortOrder();
      sortBtn.textContent = "Sort by Outlier";
      sortBtn.classList.remove("tr-active");
    }
  }

  // throttled observer
  let pending = false;
  function schedule() {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; try { scan(); } catch (e) {} }, 400);
  }

  const obs = new MutationObserver(schedule);
  obs.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("yt-navigate-finish", () => {
    document.querySelectorAll("[" + DONE + "]").forEach((el) => el.removeAttribute(DONE));
    sorted = false;
    if (sortBtn) { sortBtn.remove(); sortBtn = null; }
    setTimeout(scan, 600);
  });
  window.addEventListener("scroll", schedule, { passive: true });
  setTimeout(scan, 1000);
})();
