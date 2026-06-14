import { useState, useRef } from "react";
import { en, ar } from "./translations";
import html2pdf from "html2pdf.js";

const API_KEY = "AIzaSyASyKvq39AwGH6Nsa7wEpjRAW8z8JIJTDc";
const STAGES = [
  { icon: "📡", key: "stage0" },
  { icon: "⚡", key: "stage1" },
  { icon: "🧮", key: "stage2" },
  { icon: "⚖️", key: "stage3" },
  { icon: "🤖", key: "stage4" },
];
const NICHE_CATS = [
  { name_en: "Finance & Economy", name_ar: "المالية والاقتصاد", rpm: [12, 20], kw: ["مال", "اقتصاد", "استثمار", "بورصة", "عملات", "تجارة", "ربح", "ثروة", "finance", "money", "invest", "stock", "trading", "business", "crypto"] },
  { name_en: "Education & Development", name_ar: "التعليم والتطوير", rpm: [8, 12], kw: ["تعليم", "تطوير", "مهارات", "دروس", "تعلم", "تدريب", "education", "learn", "course", "training", "skill", "academic"] },
  { name_en: "Tech & Programming", name_ar: "التقنية والبرمجة", rpm: [5, 10], kw: ["تقنية", "تكنولوجيا", "برمجة", "كمبيوتر", "tech", "technology", "programming", "coding", "software", "ai", "ذكاء", "robot", "web"] },
  { name_en: "Health & Beauty", name_ar: "الصحة والجمال", rpm: [6, 12], kw: ["صحة", "جمال", "رشاقة", "رجيم", "عناية", "بشرة", "health", "beauty", "fitness", "skin", "hair", "workout"] },
  { name_en: "Entertainment & Gaming", name_ar: "الترفيه والألعاب", rpm: [2, 4], kw: ["ألعاب", "تسلية", "مرح", "gaming", "game", "entertainment", "fun", "play", "shorts", "comedy"] },
  { name_en: "Music", name_ar: "الموسيقى", rpm: [1, 3], kw: ["موسيقى", "غناء", "أغاني", "music", "song", "singer", "rap", "beat"] },
  { name_en: "General", name_ar: "عام", rpm: [3, 8], kw: [] },
];

/* ─── Utilities ─── */
function parseUrl(s) {
  s = s.trim();
  let m = s.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (m) return { type: "id", val: m[1] };
  m = s.match(/youtube\.com\/@([\w-]+)/);
  if (m) return { type: "handle", val: m[1] };
  m = s.match(/^@([\w-]+)$/);
  if (m) return { type: "handle", val: m[1] };
  m = s.match(/^(UC[\w-]+)$/);
  if (m) return { type: "id", val: m[1] };
  const clean = s.replace(/https?:\/\//, "").split("/")[0];
  const h = clean.replace("youtube.com", "").replace("www.", "").trim();
  return { type: "handle", val: h || clean };
}

async function fetchJ(u) {
  const r = await fetch(u);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "API Error");
  return d;
}

function fmt(n) {
  if (!n && n !== 0) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return Math.round(n).toString();
}

function monthsDiff(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
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
  if (parsed.type === "id") return parsed.val;
  const c = getCache("h:" + parsed.val);
  if (c) return c;
  const d = await fetchJ(`https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${parsed.val}&key=${API_KEY}`);
  if (d.items && d.items.length) { setCache("h:" + parsed.val, d.items[0].id); return d.items[0].id; }
  throw new Error("Channel not found: @" + parsed.val);
}

async function fetchChannel(id) {
  const c = getCache("ch:" + id);
  if (c) return c;
  const d = await fetchJ(`https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${id}&key=${API_KEY}`);
  if (!d.items || !d.items.length) throw new Error("Channel not found");
  const ch = d.items[0], st = ch.statistics, sn = ch.snippet;
  const uploadsId = ch.contentDetails.relatedPlaylists.uploads;
  const createdAt = new Date(sn.publishedAt);
  const subs = parseInt(st.subscriberCount, 10) || 0, totalViews = parseInt(st.viewCount, 10) || 0;
  const title = sn.title, thumb = sn.thumbnails?.default?.url || "";

  /* Oldest video + recent upload count */
  let oldest = null, upCount = 0, pages = 0, tok = "", recentViews = [];
  while (pages < 4 && tok !== null) {
    const pl = await fetchJ(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=50${tok ? "&pageToken=" + tok : ""}&key=${API_KEY}`);
    pages++;
    const items = pl.items || [];
    upCount += items.length;
    if (items.length) {
      const last = new Date(items[items.length - 1].snippet.publishedAt);
      if (!oldest || last < oldest) oldest = last;
      /* Collect recent view counts from first page stats */
      if (pages === 1) {
        const ids = items.map(i => i.snippet.resourceId?.videoId).filter(Boolean).slice(0, 10).join(",");
        if (ids) {
          try {
            const vd = await fetchJ(`https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${ids}&key=${API_KEY}`);
            (vd.items || []).forEach(v => recentViews.push(parseInt(v.statistics.viewCount, 10) || 0));
          } catch {}
        }
      }
    }
    tok = pl.nextPageToken || null;
  }

  const ageGap = oldest ? monthsDiff(oldest, createdAt) : 0;
  const trueAge = oldest ? monthsDiff(oldest, new Date()) : monthsDiff(createdAt, new Date());
  const viralRatio = subs > 0 ? totalViews / subs : 0;
  const isPivot = ageGap > 6;
  const avgRecentView = recentViews.length ? recentViews.reduce((a, b) => a + b, 0) / recentViews.length : 0;
  const estUploadFreq = upCount > 0 && oldest ? upCount / Math.max(1, trueAge) : 0.5;

  const r = { id, title, thumb, subs, totalViews, createdAt, oldestVideo: oldest, ageGapMonths: ageGap, trueAgeMonths: Math.round(trueAge), viralRatio: Math.round(viralRatio * 100) / 100, isPivot, avgRecentView: Math.round(avgRecentView), estUploadFreq: Math.round(estUploadFreq * 10) / 10, upCount };
  setCache("ch:" + id, r);
  return r;
}

/* ─── Verdict ─── */
function calcVerdict(data, cat) {
  const n = data.length;
  if (!n) return null;
  const avgVR = data.reduce((s, c) => s + c.viralRatio, 0) / n;
  const oldestAll = new Date(Math.min(...data.map(c => c.oldestVideo || c.createdAt)));
  const nicheAge = monthsDiff(oldestAll, new Date());
  const pivotN = data.filter(c => c.isPivot).length;
  const pivotR = pivotN / n;
  const avgSubs = data.reduce((s, c) => s + c.subs, 0) / n;
  const avgViews = data.reduce((s, c) => s + c.totalViews, 0) / n;
  const avgFreq = data.reduce((s, c) => s + c.estUploadFreq, 0) / n;

  /* Engagement Score 0-100 */
  const engScore = Math.min(100, Math.round((avgVR / 10) * 40 + (avgFreq / 10) * 30 + (1 - Math.min(1, nicheAge / 60)) * 30));

  /* Competition Level 0-100 (higher = more saturated) */
  const compScore = Math.min(100, Math.round((Math.min(1, nicheAge / 60)) * 40 + (Math.min(1, avgSubs / 500000)) * 30 + (1 - Math.min(1, avgVR / 8)) * 30));

  /* Niche Health Score 0-100 */
  const healthScore = Math.min(100, Math.round(
    Math.min(1, avgVR / 10) * 25 +
    (1 - Math.min(1, nicheAge / 60)) * 20 +
    Math.min(1, pivotR) * 15 +
    (engScore / 100) * 15 +
    (1 - compScore / 100) * 15 +
    Math.min(1, avgFreq / 15) * 10
  ));

  /* Monthly revenue estimate */
  const rpmAvg = (cat.rpm[0] + cat.rpm[1]) / 2;
  const estMonthlyRev = ((avgViews / 12) * rpmAvg / 1000).toFixed(0);

  let verdict, color, label, labelAr;
  if (healthScore >= 65) {
    verdict = "golden"; color = "green"; label = "Golden Opportunity"; labelAr = "✨ فرصة ذهبية";
  } else if (healthScore >= 40) {
    verdict = "competitive"; color = "orange"; label = "Competitive"; labelAr = "⚡ تنافسي";
  } else {
    verdict = "saturated"; color = "red"; label = "Saturated"; labelAr = "🔥 مشبع";
  }

  return { avgVR: Math.round(avgVR * 100) / 100, nicheAgeMonths: nicheAge, pivotPct: Math.round(pivotR * 100), pivotN, avgSubs, avgViews, engScore, compScore, healthScore, avgFreq: Math.round(avgFreq * 10) / 10, estMonthlyRev, verdict, color, label, labelAr, cat, rpmAvg };
}

/* ─── Component ─── */
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
  const reportRef = useRef();

  function setUrl(i, v) { const c = [...urls]; c[i] = v; setUrls(c); }

  async function analyze() {
    const valid = urls.filter(u => u.trim());
    if (!niche.trim()) return setError(t("error_niche"));
    if (valid.length < 1) return setError(t("error_urls"));
    setError(""); setResult(null); setChanData([]); setLoading(true); setStage(0);

    try {
      const parsed = valid.map(parseUrl);
      const loadP = (async () => { for (let i = 0; i < 5; i++) { await new Promise(r => setTimeout(r, 4000)); setStage(i + 1); } })();
      const ids = await Promise.all(parsed.map(resolveId));
      const data = await Promise.all(ids.map(fetchChannel));
      const cat = detectCat(niche, data.map(d => d.title));
      const verdict = calcVerdict(data, cat);
      await loadP;
      setChanData(data);
      setResult({ ...verdict, cat });
    } catch (err) {
      const m = err.message || "Error";
      if (m.includes("quota") || m.includes("403") || m.includes("exceeded")) setError(t("error_quota"));
      else setError(m);
      setLoading(false); return;
    }
    setLoading(false);
  }

  function downloadPdf() {
    const el = document.getElementById("report-content");
    if (!el) return;
    const opt = { margin: [10, 10], filename: `niche-radar-${niche.replace(/\s+/g, "-")}.pdf`, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: "mm", format: "a4", orientation: "portrait" } };
    html2pdf().set(opt).from(el).save();
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

  /* ─── Stat Box ─── */
  function StatBox({ label, value, sub, color }) {
    return (
      <div className="bg-[#111827] rounded-xl border border-gray-800 p-3 text-center">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className={`text-lg md:text-xl font-bold ${color || "text-white"}`}>{value}</p>
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
        {/* Verdict */}
        <div className={`text-center py-8 px-4 rounded-2xl border ${bc} ${bg} mb-6`}>
          <div className={`inline-block ${badgeBg} text-white text-xl md:text-2xl font-bold px-8 py-4 rounded-2xl mb-4`}>{labelText}</div>
          <p className="text-gray-300 text-sm">{descText}</p>
          <div className="mt-4 max-w-xs mx-auto bg-gray-800/60 rounded-full h-3 overflow-hidden">
            <div className={`h-full rounded-full transition-all duration-1000 ${r.color === "green" ? "bg-emerald-500" : r.color === "orange" ? "bg-amber-500" : "bg-red-500"}`} style={{ width: r.healthScore + "%" }} />
          </div>
          <p className="text-xs text-gray-400 mt-1">{t("niche_score")}: {r.healthScore}/100</p>
        </div>

        {/* Primary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatBox label={t("viral_ratio")} value={`${r.avgVR}x`} sub={t("viral_ratio_sub")} color="text-amber-400" />
          <StatBox label={t("true_age")} value={`${r.nicheAgeMonths} ${lang === "ar" ? "شهر" : "mo"}`} sub={t("true_age_sub")} />
          <StatBox label={t("pivot_rate")} value={`${r.pivotPct}%`} sub={`${r.pivotN} ${t("pivot_rate_sub")}`} color="text-purple-400" />
          <StatBox label={t("rpm_tier")} value={`$${r.cat.rpm[0]}-$${r.cat.rpm[1]}`} sub={lang === "ar" ? r.cat.name_ar : r.cat.name_en} color="text-blue-400" />
        </div>

        {/* Secondary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatBox label={t("engagement")} value={`${r.engScore}/100`} sub={t("engagement_sub")} color={r.engScore > 60 ? "text-emerald-400" : r.engScore > 30 ? "text-amber-400" : "text-red-400"} />
          <StatBox label={t("upload_freq")} value={`${r.avgFreq}/mo`} sub={t("upload_freq_sub")} />
          <StatBox label={t("competition_level")} value={`${r.compScore}/100`} sub={t("competition_level_sub")} color={r.compScore > 60 ? "text-red-400" : r.compScore > 30 ? "text-amber-400" : "text-emerald-400"} />
          <StatBox label={t("growth_potential")} value={`${r.healthScore}/100`} sub={t("growth_potential_sub")} color={r.healthScore > 60 ? "text-emerald-400" : r.healthScore > 30 ? "text-amber-400" : "text-red-400"} />
        </div>

        {/* Channels */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-white font-semibold">{chanData.length} {t("results_found")}</h3>
          <button onClick={downloadPdf} className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">{t("download_pdf")}</button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {chanData.map(ch => (
            <a key={ch.id} href={`https://youtube.com/channel/${ch.id}`} target="_blank" rel="noopener noreferrer"
              className="block bg-[#111827] rounded-xl border border-gray-800 p-4 hover:border-blue-600/50 transition group">
              <div className="flex items-center gap-3 mb-3">
                {ch.thumb ? <img src={ch.thumb} alt="" className="w-10 h-10 rounded-full" /> : <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-400">{t("no_thumbnail")}</div>}
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
              {ch.avgRecentView > 0 && <div className="mt-1 text-xs text-gray-500">{t("views")}: {fmt(ch.avgRecentView)}/video</div>}
            </a>
          ))}
        </div>

        {/* RPM detail */}
        <div className="bg-[#111827] rounded-xl border border-gray-800 p-4 mb-6">
          <h4 className="text-white font-semibold mb-2 text-sm">{t("rpm_title")}</h4>
          <p className="text-xs text-gray-400 mb-3">{t("rpm_desc")} <span className="text-amber-400">{lang === "ar" ? r.cat.name_ar : r.cat.name_en}</span></p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
            <div className="bg-gray-800/50 rounded-lg p-3"><span className="text-gray-400 text-xs">{t("avg_subs")}</span><p className="text-white font-bold text-lg">{fmt(Math.round(r.avgSubs))}</p></div>
            <div className="bg-gray-800/50 rounded-lg p-3"><span className="text-gray-400 text-xs">{t("avg_views")}</span><p className="text-white font-bold text-lg">{fmt(Math.round(r.avgViews))}</p></div>
            <div className="bg-gray-800/50 rounded-lg p-3"><span className="text-gray-400 text-xs">{t("est_monthly")}</span><p className="text-white font-bold text-lg">${r.estMonthlyRev}</p><p className="text-[10px] text-gray-600">{t("est_monthly_sub")}</p></div>
          </div>
        </div>

        {/* Hidden PDF report */}
        <div id="report-content" className="hidden">
          <div style={{ fontFamily: "Arial, sans-serif", padding: 20, color: "#111", direction: dir }}>
            <h1 style={{ fontSize: 24, color: "#1a73e8", marginBottom: 4 }}>{t("report_title")}</h1>
            <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>{niche}</p>
            <div style={{ border: "2px solid " + (r.color === "green" ? "#10b981" : r.color === "orange" ? "#f59e0b" : "#ef4444"), borderRadius: 8, padding: 12, textAlign: "center", marginBottom: 16, background: r.color === "green" ? "#ecfdf5" : r.color === "orange" ? "#fffbeb" : "#fef2f2" }}>
              <h2 style={{ fontSize: 20, margin: 0, color: r.color === "green" ? "#059669" : r.color === "orange" ? "#d97706" : "#dc2626" }}>{labelText}</h2>
              <p style={{ fontSize: 12, color: "#666", margin: "4px 0 0" }}>Score: {r.healthScore}/100</p>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
              <tbody>
                {[
                  [t("viral_ratio"), `${r.avgVR}x`, t("true_age"), `${r.nicheAgeMonths} mo`],
                  [t("pivot_rate"), `${r.pivotPct}%`, t("rpm_tier"), `$${r.cat.rpm[0]}-$${r.cat.rpm[1]}`],
                  [t("engagement"), `${r.engScore}/100`, t("competition_level"), `${r.compScore}/100`],
                  [t("niche_score"), `${r.healthScore}/100`, t("est_monthly"), `$${r.estMonthlyRev}`],
                ].map((row, i) => (
                  <tr key={i}>
                    <td style={{ padding: "4px 8px", fontWeight: 600 }}>{row[0]}</td>
                    <td style={{ padding: "4px 8px" }}>{row[1]}</td>
                    <td style={{ padding: "4px 8px", fontWeight: 600 }}>{row[2]}</td>
                    <td style={{ padding: "4px 8px" }}>{row[3]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 style={{ fontSize: 14, marginBottom: 8 }}>Channels Analyzed</h3>
            {chanData.map(ch => (
              <div key={ch.id} style={{ border: "1px solid #ddd", borderRadius: 6, padding: 8, marginBottom: 8, fontSize: 11 }}>
                <strong>{ch.title}</strong> — {fmt(ch.subs)} subs, {fmt(ch.totalViews)} views, Ratio: {ch.viralRatio}x, Age: {ch.trueAgeMonths}mo{ch.isPivot ? ", PIVOT DETECTED" : ""}
              </div>
            ))}
            <p style={{ fontSize: 10, color: "#999", marginTop: 16, textAlign: "center" }}>{t("footer")}</p>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Guide Section ─── */
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
      </div>
    );
  }

  /* ─── How It Works Page ─── */
  function renderHow() {
    const items = [
      { key: "hv_viral", icon: "📈" },
      { key: "hv_age", icon: "📅" },
      { key: "hv_pivot", icon: "🔄" },
      { key: "hv_rpm", icon: "💰" },
      { key: "hv_engagement", icon: "❤️" },
      { key: "hv_competition", icon: "⚔️" },
      { key: "hv_score", icon: "🏆" },
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

  /* ─── About Page ─── */
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
            <p className="text-xs text-gray-600 mt-1">github.com/siradj85/outlier-radar</p>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Main Page ─── */
  function renderMain() {
    return (
      <>
        <header className="text-center mb-6 mt-4">
          <h1 className="text-2xl md:text-4xl font-bold text-white tracking-tight">
            <span className="text-blue-500">Niche</span>{" "}
            <span className="text-amber-400">Radar</span>
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

  /* ─── Nav ─── */
  const nav = [
    { id: "main", label_key: "nav_home" },
    { id: "how", label_key: "nav_how" },
    { id: "about", label_key: "nav_about" },
  ];

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-gray-200 flex flex-col" dir={dir}>
      <div className="w-full max-w-4xl mx-auto p-4 flex-1">
        {/* Nav & Lang */}
        <div className="flex items-center justify-between mb-6 border-b border-gray-800 pb-3">
          <div className="flex gap-4 text-sm">
            {nav.map(n => (
              <button key={n.id} onClick={() => setPage(n.id)}
                className={`transition ${page === n.id ? "text-amber-400 font-semibold" : "text-gray-500 hover:text-gray-300"}`}>
                {t(n.label_key)}
              </button>
            ))}
          </div>
          <button onClick={() => setLang(lang === "en" ? "ar" : "en")}
            className="text-xs text-gray-400 hover:text-white transition border border-gray-700 rounded-lg px-3 py-1">
            {t("lang_switch")}
          </button>
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
