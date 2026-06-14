import { useState } from "react";
import { en, ar } from "./translations";

const API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY || "";
const STAGES = [
  { icon: "📡", key: "stage0" },
  { icon: "⚡", key: "stage1" },
  { icon: "🧮", key: "stage2" },
  { icon: "⚖️", key: "stage3" },
  { icon: "🤖", key: "stage4" },
];
const NICHE_CATS = [
  { name_en: "Finance & Economy", name_ar: "المالية والاقتصاد", rpm: [12, 20], kw: ["مال", "اقتصاد", "استثمار", "بورصة", "عملات", "تجارة", "ربح", "ثروة", "finance", "money", "invest", "stock", "trading", "business", "crypto"] },
  { name_en: "Education & Development", name_ar: "التعليم والتطوير", rpm: [8, 12], kw: ["تعليم", "تطوير", "مهارات", "دروس", "تعلم", "تدريب", "education", "learn", "course", "training", "skill"] },
  { name_en: "Tech & Programming", name_ar: "التقنية والبرمجة", rpm: [5, 10], kw: ["تقنية", "تكنولوجيا", "برمجة", "كمبيوتر", "tech", "technology", "programming", "coding", "software", "ai", "ذكاء", "robot"] },
  { name_en: "Health & Beauty", name_ar: "الصحة والجمال", rpm: [6, 12], kw: ["صحة", "جمال", "رشاقة", "رجيم", "عناية", "بشرة", "health", "beauty", "fitness", "skin", "hair", "workout"] },
  { name_en: "Entertainment & Gaming", name_ar: "الترفيه والألعاب", rpm: [2, 4], kw: ["ألعاب", "تسلية", "مرح", "gaming", "game", "entertainment", "fun", "comedy"] },
  { name_en: "Music", name_ar: "الموسيقى", rpm: [1, 3], kw: ["موسيقى", "غناء", "أغاني", "music", "song", "singer"] },
  { name_en: "General", name_ar: "عام", rpm: [3, 8], kw: [] },
];

/* ─── Utilities ─── */
function parseUrl(s) {
  s = s.trim().replace(/\/shorts(\/|$)/, "");
  let m;
  m = s.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (m) return { type: "id", val: m[1] };
  m = s.match(/youtube\.com\/@([^\/\s?]+)/);
  if (m) return { type: "handle", val: m[1] };
  m = s.match(/^@([^\/\s?]+)/);
  if (m) return { type: "handle", val: m[1] };
  m = s.match(/^(UC[\w-]+)$/);
  if (m) return { type: "id", val: m[1] };
  m = s.match(/@([^\/\s?]+)/);
  if (m) return { type: "handle", val: m[1] };
  return { type: "handle", val: s };
}

async function fetchJ(u) {
  const r = await fetch(u);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "API Error");
  return d;
}

function fmt(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toString();
}

function monthsDiff(a, b) {
  const d = Math.abs((b - a) / (1000 * 60 * 60 * 24 * 30.44));
  return Math.round(d);
}

function getCache(k) {
  try {
    const item = JSON.parse(localStorage.getItem("nr_" + k));
    if (item && Date.now() - item.ts < 86400000) return item.data;
  } catch {}
  return null;
}
function setCache(k, d) {
  try { localStorage.setItem("nr_" + k, JSON.stringify({ ts: Date.now(), data: d })); } catch {}
}

function detectCat(niche, titles) {
  const txt = (niche + " " + titles.join(" ")).toLowerCase();
  for (const c of NICHE_CATS) {
    if (c.kw.length && c.kw.some((k) => txt.includes(k))) return c;
  }
  return NICHE_CATS[NICHE_CATS.length - 1];
}

/* ─── API ─── */
async function resolveId(parsed) {
  try {
    if (parsed.type === "id") return parsed.val;
    const c = getCache("h:" + parsed.val);
    if (c) return c;
    const d = await fetchJ(`https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${encodeURIComponent(parsed.val)}&key=${API_KEY}`);
    if (d.items && d.items.length) { setCache("h:" + parsed.val, d.items[0].id); return d.items[0].id; }
    return null;
  } catch { return null; }
}

function safeNum(v, fallback = 0) {
  const n = parseInt(v, 10);
  return isNaN(n) ? fallback : n;
}

async function fetchChannel(id) {
  const c = getCache("ch:" + id);
  if (c) return c;
  try {
    const d = await fetchJ(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&id=${id}&key=${API_KEY}`);
    if (!d.items || !d.items.length) return null;
    const ch = d.items[0], st = ch.statistics, sn = ch.snippet;

    const createdAt = new Date(sn.publishedAt);
    const subs = safeNum(st.subscriberCount);
    const totalViews = safeNum(st.viewCount);
    const videoCount = safeNum(st.videoCount);
    const title = sn.title || "Unknown";
    const thumb = sn.thumbnails?.default?.url || "";
    const trueAge = Math.max(1, monthsDiff(createdAt, new Date()));
    const viralRatio = subs > 0 ? +(totalViews / subs).toFixed(2) : 0;
    const estFreq = videoCount > 0 && trueAge > 0 ? +(videoCount / trueAge).toFixed(1) : 0.5;

    const r = { id, title, thumb, subs, totalViews, createdAt, oldestVideo: null, ageGapMonths: 0, trueAgeMonths: trueAge, viralRatio, isPivot: false, avgRecent: 0, estFreq, upCount: videoCount };
    setCache("ch:" + id, r);
    return r;
  } catch { return null; }
}

/* ─── Verdict ─── */
function calcVerdict(data, cat) {
  const n = data.length;

  const avgVR = data.reduce((s, c) => s + c.viralRatio, 0) / n;
  const oldestAll = new Date(Math.min(...data.map(c => c.oldestVideo || c.createdAt)));
  const nicheAge = Math.max(1, monthsDiff(oldestAll, new Date()));
  const pivotN = data.filter(c => c.isPivot).length;
  const pivotR = pivotN / n;
  const avgSubs = data.reduce((s, c) => s + c.subs, 0) / n;
  const avgViews = data.reduce((s, c) => s + c.totalViews, 0) / n;
  const avgFreq = data.reduce((s, c) => s + c.estFreq, 0) / n;

  /* Normalize each factor 0-100 */
  const viralScore = Math.min(100, (avgVR / 15) * 100);
  const ageScore = Math.min(100, (1 - Math.min(1, nicheAge / 60)) * 100);
  const pivotScore = Math.min(100, pivotR * 100);
  const freqScore = Math.min(100, (avgFreq / 10) * 100);

  /* Engagement proxy: higher viralRatio with recent views = good */
  const avgRecentN = data.reduce((s, c) => s + c.avgRecent, 0) / n;
  const engScore = Math.min(100, Math.round(viralScore * 0.4 + freqScore * 0.3 + (avgRecentN > 1000 ? 30 : avgRecentN > 100 ? 15 : 5)));

  /* Competition: higher for old, big channels */
  const compScore = Math.min(100, Math.round(ageScore < 50 ? ageScore : 50 + (Math.min(1, avgSubs / 200000)) * 50));

  /* Health: weighted composite */
  const healthRaw = viralScore * 0.3 + ageScore * 0.2 + pivotScore * 0.1 + (1 - compScore / 100) * 0.15 + freqScore * 0.1 + (engScore / 100) * 0.15;
  const healthScore = Math.max(0, Math.min(100, Math.round(healthRaw)));

  /* RPM */
  const rpmAvg = (cat.rpm[0] + cat.rpm[1]) / 2;
  const estMonthly = Math.round((avgViews / 12) * rpmAvg / 1000);

  let verdict, color, label, labelAr;
  if (healthScore >= 60) {
    verdict = "golden"; color = "green"; label = "Golden Opportunity"; labelAr = "✨ فرصة ذهبية";
  } else if (healthScore >= 35) {
    verdict = "competitive"; color = "orange"; label = "Competitive"; labelAr = "⚡ تنافسي";
  } else {
    verdict = "saturated"; color = "red"; label = "Saturated"; labelAr = "🔥 مشبع";
  }

  return {
    avgVR: +avgVR.toFixed(2), nicheAgeMonths: nicheAge, pivotPct: Math.round(pivotR * 100), pivotN,
    avgSubs: Math.round(avgSubs), avgViews: Math.round(avgViews), engScore, compScore, healthScore,
    avgFreq: +avgFreq.toFixed(1), estMonthly, verdict, color, label, labelAr, cat, rpmAvg,
    channelCount: n,
  };
}

/* ─── App ─── */
export default function App() {
  const [lang, setLang] = useState("en");
  const t = (k) => (lang === "ar" ? ar : en)[k] || k;
  const dir = lang === "ar" ? "rtl" : "ltr";
  const [page, setPage] = useState("main");
  const [niche, setNiche] = useState("");
  const [urls, setUrls] = useState(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [chanData, setChanData] = useState([]);

  function setUrl(i, v) { const c = [...urls]; c[i] = v; setUrls(c); }

  async function analyze() {
    const valid = urls.filter(u => u.trim());
    if (!niche.trim()) return setError(t("error_niche"));
    if (valid.length < 1) return setError(t("error_urls"));
    if (!API_KEY) return setError(t("error_api_key"));
    setError(""); setResult(null); setChanData([]); setLoading(true); setStage(0);

    const loadP = (async () => {
      for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 4000)); setStage(i + 1); }
    })();

    try {
      const parsed = valid.map(parseUrl);
      const results = await Promise.allSettled(parsed.map(resolveId));
      const ids = results.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
      if (ids.length === 0) { setError(t("error_urls")); setLoading(false); return; }

      const chanResults = await Promise.allSettled(ids.map(fetchChannel));
      const data = chanResults.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
      if (data.length === 0) { setError(t("error_urls")); setLoading(false); return; }

      if (data.length < valid.length) {
        const diff = valid.length - data.length;
        setError(t("error_partial").replace("{n}", diff));
      }

      const cat = detectCat(niche, data.map(d => d.title));
      const verdict = calcVerdict(data, cat);

      await loadP;
      setChanData(data);
      setResult(verdict);
    } catch (err) {
      setError(err?.message || t("error_urls"));
    }
    setLoading(false);
  }

  function printPdf() {
    const r = result;
    if (!r) return;
    const labelText = lang === "ar" ? r.labelAr : r.label;

    const html = `<html lang="${lang}" dir="${dir}"><head><meta charset="UTF-8"><title>Niche Radar Report</title>
    <style>
      body{font-family:Arial,sans-serif;padding:30px;color:#222;direction:${dir};max-width:700px;margin:auto}
      h1{color:#1a73e8;font-size:24px;margin:0 0 4px}
      .sub{color:#666;font-size:13px;margin-bottom:20px}
      .verdict{text-align:center;padding:16px;border-radius:8px;margin-bottom:20px;font-size:18px;font-weight:bold}
      .green{background:#ecfdf5;border:2px solid #10b981;color:#059669}
      .orange{background:#fffbeb;border:2px solid #f59e0b;color:#d97706}
      .red{background:#fef2f2;border:2px solid #ef4444;color:#dc2626}
      table{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:20px}
      td{padding:6px 10px;border-bottom:1px solid #eee}
      td:first-child{font-weight:600;color:#555}
      h2{font-size:16px;margin:16px 0 8px;color:#333}
      .ch{background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:10px 14px;margin-bottom:8px;font-size:13px}
      .ch strong{color:#111}
      .ch .tag{color:#7c3aed;font-weight:bold}
      .footer{text-align:center;color:#999;font-size:10px;margin-top:24px;border-top:1px solid #eee;padding-top:12px}
      @media print{body{padding:15px}table{font-size:12px}.ch{break-inside:avoid}}
    </style></head><body>
    <h1>Niche Radar Report</h1>
    <p class="sub">${niche} &mdash; ${r.channelCount} ${lang === "ar" ? "قناة محللة" : "channels analyzed"}</p>
    <div class="verdict ${r.color}">${labelText} &mdash; ${lang === "ar" ? "الدرجة" : "Score"}: ${r.healthScore}/100</div>
    <table>
      <tr><td>${t("viral_ratio")}</td><td>${r.avgVR}x</td><td>${t("true_age")}</td><td>${r.nicheAgeMonths} ${lang === "ar" ? "شهر" : "mo"}</td></tr>
      <tr><td>${t("pivot_rate")}</td><td>${r.pivotPct}%</td><td>${t("rpm_tier")}</td><td>$${r.cat.rpm[0]}-$${r.cat.rpm[1]}</td></tr>
      <tr><td>${t("engagement")}</td><td>${r.engScore}/100</td><td>${t("competition_level")}</td><td>${r.compScore}/100</td></tr>
      <tr><td>${t("niche_score")}</td><td>${r.healthScore}/100</td><td>${t("est_monthly")}</td><td>$${r.estMonthly}</td></tr>
      <tr><td>${t("upload_freq")}</td><td>${r.avgFreq}/mo</td><td>${t("avg_subs")}</td><td>${fmt(r.avgSubs)}</td></tr>
    </table>
    <h2>${lang === "ar" ? "القنوات المحللة" : "Channels Analyzed"}</h2>
    ${chanData.map(ch => `<div class="ch"><strong>${ch.title}</strong> &mdash; ${fmt(ch.subs)} ${lang === "ar" ? "مشترك" : "subs"}, ${fmt(ch.totalViews)} ${lang === "ar" ? "مشاهدة" : "views"}, Ratio: ${ch.viralRatio}x, Age: ${ch.trueAgeMonths}mo${ch.isPivot ? ' <span class="tag">🔄 Pivot Detected</span>' : ""}</div>`).join("")}
    <p class="footer">Niche Radar &copy; 2026</p></body></html>`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(() => {
      try { iframe.contentWindow.print(); } catch { window.print(); }
      setTimeout(() => { document.body.removeChild(iframe); }, 1000);
    }, 600);
  }

  /* ─── Loading ─── */
  function renderLoading() {
    const cur = Math.min(stage, 4);
    return (
      <div className="py-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600/20 mb-6">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="space-y-5 max-w-md mx-auto">
          {STAGES.map((s, i) => (
            <div key={i} className={`flex items-center gap-3 text-sm transition-all duration-500 ${i === cur ? "opacity-100" : i < cur ? "opacity-40" : "opacity-20"}`}>
              <span className="text-xl">{s.icon}</span>
              <span className={i === cur ? "text-white" : "text-gray-500"}>{t(s.key)}</span>
              {i < cur && <span className={`${dir === "rtl" ? "mr-auto" : "ml-auto"} text-emerald-400 text-xs`}>✓</span>}
              {i === cur && <span className={`${dir === "rtl" ? "mr-auto" : "ml-auto"} w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin`} />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  function StatBox({ label, value, sub, color }) {
    const display = value === null || value === undefined || value === "NaN" || (typeof value === "string" && value.includes("NaN")) ? "—" : value;
    return (
      <div className="bg-[#111827] rounded-xl border border-gray-800 p-3 text-center">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className={`text-lg md:text-xl font-bold ${color || "text-white"}`}>{display}</p>
        {sub && <p className="text-[10px] text-gray-600 mt-0.5 leading-tight">{sub}</p>}
      </div>
    );
  }

  /* ─── Result ─── */
  function renderResult() {
    if (!result) return null;
    const r = result;
    const bc = r.color === "green" ? "border-emerald-500/50" : r.color === "orange" ? "border-amber-500/50" : "border-red-500/50";
    const bg = r.color === "green" ? "bg-emerald-900/20" : r.color === "orange" ? "bg-amber-900/20" : "bg-red-900/20";
    const badgeBg = r.color === "green" ? "bg-emerald-600" : r.color === "orange" ? "bg-amber-600" : "bg-red-600";
    const labelText = lang === "ar" ? r.labelAr : r.label;
    const descText = lang === "ar" ? (r.verdict === "golden" ? ar.golden_desc : r.verdict === "competitive" ? ar.competitive_desc : ar.saturated_desc) : (r.verdict === "golden" ? en.golden_desc : r.verdict === "competitive" ? en.competitive_desc : en.saturated_desc);

    return (
      <div className="animate-fade-in" style={{ animation: "fadeIn 0.6s" }}>
        {/* API quota warning */}
        <div className="bg-amber-900/20 border border-amber-800/50 text-amber-300 rounded-xl px-4 py-2 mb-4 text-xs text-center">
          ⚠️ {lang === "ar" ? `تم تحليل ${r.channelCount} قنوات. النتائج أكثر دقة مع 5 قنوات أو أكثر.` : `${r.channelCount} channels analyzed. Results are more reliable with 5+ channels.`}
        </div>

        <div className={`text-center py-8 px-4 rounded-2xl border ${bc} ${bg} mb-6`}>
          <div className={`inline-block ${badgeBg} text-white text-xl md:text-2xl font-bold px-8 py-4 rounded-2xl mb-4`}>{labelText}</div>
          <p className="text-gray-300 text-sm">{descText}</p>
          <div className="mt-4 max-w-xs mx-auto bg-gray-800/60 rounded-full h-3 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ${r.color === "green" ? "bg-emerald-500" : r.color === "orange" ? "bg-amber-500" : "bg-red-500"}`} style={{ width: Math.max(3, r.healthScore) + "%" }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">{t("niche_score")}: {r.healthScore}/100</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatBox label={t("viral_ratio")} value={`${r.avgVR}x`} sub={t("viral_ratio_sub")} color="text-amber-400" />
          <StatBox label={t("true_age")} value={`${r.nicheAgeMonths} ${lang === "ar" ? "شهر" : "mo"}`} sub={t("true_age_sub")} />
          <StatBox label={t("pivot_rate")} value={`${r.pivotPct}%`} sub={`${r.pivotN} ${t("pivot_rate_sub")}`} color="text-purple-400" />
          <StatBox label={t("rpm_tier")} value={`$${r.cat.rpm[0]}-$${r.cat.rpm[1]}`} sub={lang === "ar" ? r.cat.name_ar : r.cat.name_en} color="text-blue-400" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatBox label={t("engagement")} value={`${r.engScore}/100`} sub={t("engagement_sub")} color={r.engScore > 60 ? "text-emerald-400" : r.engScore > 30 ? "text-amber-400" : "text-red-400"} />
          <StatBox label={t("upload_freq")} value={`${r.avgFreq}/mo`} sub={t("upload_freq_sub")} />
          <StatBox label={t("competition_level")} value={`${r.compScore}/100`} sub={t("competition_level_sub")} color={r.compScore > 60 ? "text-red-400" : r.compScore > 30 ? "text-amber-400" : "text-emerald-400"} />
          <StatBox label={t("growth_potential")} value={`${r.healthScore}/100`} sub={t("growth_potential_sub")} color={r.healthScore > 60 ? "text-emerald-400" : r.healthScore > 30 ? "text-amber-400" : "text-red-400"} />
        </div>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">{chanData.length} {t("results_found")}</h3>
          {result && <button onClick={printPdf} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">{t("download_pdf")}</button>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {chanData.map(ch => (
            <a key={ch.id} href={`https://youtube.com/channel/${ch.id}`} target="_blank" rel="noopener noreferrer"
              className="block bg-[#111827] rounded-xl border border-gray-800 p-4 hover:border-blue-600/50 transition group">
              <div className="flex items-center gap-3 mb-3">
                {ch.thumb ? <img src={ch.thumb} alt="" className="w-10 h-10 rounded-full" /> : <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">?</div>}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate group-hover:text-blue-400 transition">{ch.title}</p>
                  <p className="text-xs text-gray-500">{ch.id.slice(0, 14)}...</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div><span className="text-gray-500">{t("subscribers")}</span><br /><span className="text-white font-medium">{fmt(ch.subs)}</span></div>
                <div><span className="text-gray-500">{t("views")}</span><br /><span className="text-white font-medium">{fmt(ch.totalViews)}</span></div>
                <div><span className="text-gray-500">{t("ratio")}</span><br /><span className="text-amber-400 font-medium">{ch.viralRatio}x</span></div>
                <div><span className="text-gray-500">{t("real_age")}</span><br /><span className="text-white font-medium">{ch.trueAgeMonths} {lang === "ar" ? "شهر" : "mo"}</span></div>
              </div>
              {ch.isPivot && <div className="mt-2 text-xs text-purple-400 font-medium">🔄 {t("pivot_detected")}</div>}
              {ch.avgRecent > 0 && <div className="mt-1 text-xs text-gray-500">{t("views")}: {fmt(ch.avgRecent)}/video</div>}
            </a>
          ))}
        </div>

        <div className="bg-[#111827] rounded-xl border border-gray-800 p-4 mb-6">
          <h4 className="text-white font-semibold mb-2 text-sm">{t("rpm_title")}</h4>
          <p className="text-xs text-gray-400 mb-3">{t("rpm_desc")} <span className="text-amber-400">{lang === "ar" ? r.cat.name_ar : r.cat.name_en}</span></p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-800/50 rounded-lg p-3"><span className="text-gray-400 text-xs">{t("avg_subs")}</span><p className="text-white font-bold text-lg">{fmt(r.avgSubs)}</p></div>
            <div className="bg-gray-800/50 rounded-lg p-3"><span className="text-gray-400 text-xs">{t("avg_views")}</span><p className="text-white font-bold text-lg">{fmt(r.avgViews)}</p></div>
            <div className="bg-gray-800/50 rounded-lg p-3"><span className="text-gray-400 text-xs">{t("est_monthly")}</span><p className="text-white font-bold text-lg">${r.estMonthly}</p><p className="text-[10px] text-gray-600">{t("est_monthly_sub")}</p></div>
          </div>
        </div>
      </div>
    );
  }

  function renderGuide() {
    return (
      <div className="bg-[#111827] rounded-2xl p-5 mb-6 border border-gray-800">
        <h3 className="text-white font-semibold text-sm mb-4">{t("guide_title")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-400">
          <div className="flex gap-2 items-start"><span className="text-amber-400 text-base shrink-0">📈</span><p>{t("guide_1")}</p></div>
          <div className="flex gap-2 items-start"><span className="text-blue-400 text-base shrink-0">📅</span><p>{t("guide_2")}</p></div>
          <div className="flex gap-2 items-start"><span className="text-purple-400 text-base shrink-0">🔄</span><p>{t("guide_3")}</p></div>
          <div className="flex gap-2 items-start"><span className="text-emerald-400 text-base shrink-0">💰</span><p>{t("guide_4")}</p></div>
        </div>
        <div className="mt-4 bg-blue-900/20 border border-blue-800/50 rounded-xl p-3 text-xs text-blue-300">
          💡 {lang === "ar" ? "النتيجة تعتمد على القنوات التي أدخلتها. للحصول على تقييم أدق، أضف 5 قنوات منافسة على الأقل. القنوات الكبيرة والقديمة تخفض النتيجة، بينما القنوات الصاعدة ترفعها." : "Results depend on the channels you enter. For better accuracy, add at least 5 competitor channels. Large/old channels lower the score, while rising channels boost it."}
        </div>
      </div>
    );
  }

  function renderHow() {
    const items = [
      { key: "hv_viral", icon: "📈" }, { key: "hv_age", icon: "📅" }, { key: "hv_pivot", icon: "🔄" },
      { key: "hv_rpm", icon: "💰" }, { key: "hv_engagement", icon: "❤️" }, { key: "hv_competition", icon: "⚔️" }, { key: "hv_score", icon: "🏆" },
    ];
    return (
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-4 text-center">{t("how_title")}</h1>
        <p className="text-gray-400 text-sm text-center mb-8">{t("how_desc")}</p>
        <div className="space-y-4">
          {items.map(item => (
            <div key={item.key} className="bg-[#111827] rounded-xl border border-gray-800 p-4">
              <h3 className="text-white font-semibold text-sm mb-1"><span className="text-lg">{item.icon}</span> {t(item.key + "_title")}</h3>
              <p className="text-xs text-gray-400 leading-relaxed">{t(item.key + "_desc")}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderAbout() {
    return (
      <div className="max-w-2xl mx-auto text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-4">{t("about_title")}</h1>
        <div className="bg-[#111827] rounded-2xl border border-gray-800 p-6 space-y-4">
          <p className="text-gray-300 text-sm">{t("about_desc")}</p>
          <p className="text-gray-400 text-sm">{t("about_how")}</p>
          <p className="text-gray-400 text-sm">{t("about_who")}</p>
          <div className="border-t border-gray-700 pt-4 mt-4">
            <p className="text-xs text-gray-500">{t("about_disclaimer")}</p>
            <p className="text-xs text-gray-600 mt-2">YouTube Data API v3 · React + Vite + Tailwind</p>
          </div>
        </div>
      </div>
    );
  }

  function renderMain() {
    return (
      <>
        <header className="text-center mb-6 mt-4">
          <h1 className="text-2xl md:text-4xl font-bold text-white tracking-tight">
            <span className="text-blue-500">Niche</span> <span className="text-amber-400">Radar</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm">{t("tagline")}</p>
        </header>

        <section className="bg-[#111827] rounded-2xl p-4 md:p-6 mb-6 shadow-lg border border-gray-800">
          <h2 className="text-white font-semibold text-sm mb-4">{t("analyze_h1")}</h2>
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-1">{t("niche_label")}</label>
            <input type="text" value={niche} onChange={e => setNiche(e.target.value)} placeholder={t("niche_placeholder")}
              className="w-full bg-[#1e293b] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition" />
          </div>
          <label className="block text-xs text-gray-400 mb-2">{t("urls_label")}</label>
          <div className="space-y-2 mb-3">
            {urls.map((u, i) => (
              <div key={i} className="flex gap-2">
                <input type="text" value={u} onChange={e => setUrl(i, e.target.value)} placeholder={t("url_placeholder")}
                  className="flex-1 bg-[#1e293b] border border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition" />
                {urls.length > 1 && <button onClick={() => setUrls(urls.filter((_, j) => j !== i))} className="text-gray-500 hover:text-red-400 px-2 text-lg">✕</button>}
              </div>
            ))}
          </div>
          {urls.length < 5 && <button onClick={() => setUrls([...urls, ""])} className="text-blue-400 text-xs hover:text-blue-300 transition mb-4 block">{t("add_url")}</button>}
          <button onClick={analyze} disabled={loading}
            className="w-full bg-gradient-to-l from-blue-600 to-amber-500 text-white font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50 text-sm">
            {loading ? t("loading") : t("analyze_btn")}
          </button>
        </section>

        {error && <div className="bg-red-900/40 border border-red-800 text-red-300 rounded-xl px-4 py-3 mb-6 text-sm text-center">{error}</div>}
        {loading && renderLoading()}
        {result && renderResult()}
        {!loading && !result && renderGuide()}
      </>
    );
  }

  const nav = [
    { id: "main", label_key: "nav_home" },
    { id: "how", label_key: "nav_how" },
    { id: "about", label_key: "nav_about" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-gray-200 flex flex-col" dir={dir}>
      <div className="w-full max-w-4xl mx-auto p-4 flex-1">
        <div className="flex items-center justify-between mb-6 border-b border-gray-800 pb-3">
          <div className="flex gap-4 text-sm">
            {nav.map(n => (
              <button key={n.id} onClick={() => setPage(n.id)}
                className={`transition ${page === n.id ? "text-amber-400 font-semibold" : "text-gray-500 hover:text-gray-300"}`}>{t(n.label_key)}</button>
            ))}
          </div>
          <button onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="text-xs text-gray-400 hover:text-white transition border border-gray-700 rounded-lg px-3 py-1">{t("lang_switch")}</button>
        </div>
        {page === "main" && renderMain()}
        {page === "how" && renderHow()}
        {page === "about" && renderAbout()}
        <footer className="text-center text-gray-600 text-xs py-8 mt-8 border-t border-gray-800">{t("footer")}</footer>
      </div>
      <style>{`@keyframes fadeIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }`}</style>
    </div>
  );
}
