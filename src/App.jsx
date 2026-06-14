import { useState } from "react";

/* ═══════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════ */
const API_KEY = "AIzaSyASyKvq39AwGH6Nsa7wEpjRAW8z8JIJTDc";
const STAGES = [
  { icon: "📡", text: "جمع بيانات يوتيوب والعلامات المخفية" },
  { icon: "⚡", text: "فحص تغيير المسار والتحقق من العمر الحقيقي" },
  { icon: "🧮", text: "حساب معامل الانتشار وعمق التفاعل" },
  { icon: "⚖️", text: "مسح المخاطر: سلامة الربح وتصنيف RPM" },
  { icon: "🤖", text: "إنشاء التقرير النهائي ومعايرة التقييم" },
];
const NICHE_CATS = [
  { name: "المالية والاقتصاد", rpm: [12, 20], kw: ["مال", "اقتصاد", "استثمار", "بورصة", "عملات", "تجارة", "ربح", "ثروة", "finance", "money", "invest", "stock", "trading", "business"] },
  { name: "التعليم والتطوير", rpm: [8, 12], kw: ["تعليم", "تطوير", "مهارات", "دروس", "تعلم", "تدريب", "education", "learn", "course", "training"] },
  { name: "التقنية والبرمجة", rpm: [5, 10], kw: ["تقنية", "تكنولوجيا", "برمجة", "كمبيوتر", "tech", "technology", "programming", "coding", "software", "ai", "ذكاء"] },
  { name: "الصحة والجمال", rpm: [6, 12], kw: ["صحة", "جمال", "رشاقة", "رجيم", "عناية", "بشرة", "health", "beauty", "fitness", "skin"] },
  { name: "الترفيه والألعاب", rpm: [2, 4], kw: ["ألعاب", "تسلية", "مرح", "gaming", "game", "entertainment", "fun"] },
  { name: "الموسيقى", rpm: [1, 3], kw: ["موسيقى", "غناء", "أغاني", "music", "song"] },
  { name: "عام", rpm: [3, 8], kw: [] },
];

/* ═══════════════════════════════════════════════
   UTILITY
   ═══════════════════════════════════════════════ */
function parseUrl(input) {
  const s = input.trim();
  const m1 = s.match(/youtube\.com\/channel\/(UC[\w-]+)/);
  if (m1) return { type: "id", val: m1[1] };
  const m2 = s.match(/youtube\.com\/@([\w-]+)/);
  if (m2) return { type: "handle", val: m2[1] };
  const m3 = s.match(/^@([\w-]+)$/);
  if (m3) return { type: "handle", val: m3[1] };
  const m4 = s.match(/^(UC[\w-]+)$/);
  if (m4) return { type: "id", val: m4[1] };
  return { type: "handle", val: s.replace(/https?:\/\//, "").split("/")[0] };
}

async function fetchJ(u) {
  const r = await fetch(u);
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || "خطأ في API");
  return d;
}

function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); }

function fmt(n) {
  if (!n) return "0";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return n.toString();
}

function monthsBetween(a, b) {
  return (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth();
}

/* ═══════════════════════════════════════════════
   CACHE (24h localStorage)
   ═══════════════════════════════════════════════ */
function getCache(k) {
  try {
    const item = JSON.parse(localStorage.getItem("or_cache_" + k));
    if (item && Date.now() - item.ts < 86400000) return item.data;
  } catch {}
  return null;
}
function setCache(k, data) {
  try { localStorage.setItem("or_cache_" + k, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

/* ═══════════════════════════════════════════════
   NICHE CATEGORY DETECTION
   ═══════════════════════════════════════════════ */
function detectNiche(nicheName, channelTitles) {
  const txt = (nicheName + " " + channelTitles.join(" ")).toLowerCase();
  for (const c of NICHE_CATS) {
    if (c.kw.length && c.kw.some((k) => txt.includes(k))) return c;
  }
  return NICHE_CATS[NICHE_CATS.length - 1];
}

/* ═══════════════════════════════════════════════
   YOUTUBE DATA FETCHING
   ═══════════════════════════════════════════════ */
async function resolveChannelId(parsed) {
  if (parsed.type === "id") return parsed.val;
  const cached = getCache("handle:" + parsed.val);
  if (cached) return cached;
  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet&forHandle=${parsed.val}&key=${API_KEY}`;
  const data = await fetchJ(url);
  if (data.items && data.items.length > 0) {
    setCache("handle:" + parsed.val, data.items[0].id);
    return data.items[0].id;
  }
  throw new Error(`لم يتم العثور على القناة: @${parsed.val}`);
}

async function fetchChannelFull(channelId) {
  const cached = getCache("channel:" + channelId);
  if (cached) return cached;

  const url = `https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&id=${channelId}&key=${API_KEY}`;
  const data = await fetchJ(url);
  if (!data.items || !data.items.length) throw new Error("القناة غير موجودة");
  const ch = data.items[0];

  const uploadsId = ch.contentDetails.relatedPlaylists.uploads;
  const createdAt = new Date(ch.snippet.publishedAt);
  const subs = parseInt(ch.statistics.subscriberCount, 10) || 0;
  const totalViews = parseInt(ch.statistics.viewCount, 10) || 0;
  const title = ch.snippet.title;
  const thumbnail = ch.snippet.thumbnails?.default?.url || "";

  /* Find oldest video via pagination */
  let oldestVideoDate = null;
  let pageToken = "";
  let pages = 0;
  while (pages < 6) {
    const plUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsId}&maxResults=50${pageToken ? "&pageToken=" + pageToken : ""}&key=${API_KEY}`;
    const pl = await fetchJ(plUrl);
    pages++;
    const items = pl.items || [];
    if (items.length > 0) {
      const last = new Date(items[items.length - 1].snippet.publishedAt);
      if (!oldestVideoDate || last < oldestVideoDate) oldestVideoDate = last;
    }
    if (pl.nextPageToken) pageToken = pl.nextPageToken;
    else break;
  }

  const ageGapMonths = oldestVideoDate ? monthsBetween(oldestVideoDate, createdAt) : 0;
  const trueNicheAgeMonths = oldestVideoDate
    ? monthsBetween(oldestVideoDate, new Date())
    : monthsBetween(createdAt, new Date());
  const viralRatio = subs > 0 ? totalViews / subs : 0;
  const isPivot = ageGapMonths > 6;

  const result = {
    channelId,
    title,
    thumbnail,
    subs,
    totalViews,
    createdAt,
    oldestVideoDate,
    ageGapMonths,
    trueNicheAgeMonths,
    viralRatio: Math.round(viralRatio * 100) / 100,
    isPivot,
  };

  setCache("channel:" + channelId, result);
  return result;
}

/* ═══════════════════════════════════════════════
   VERDICT CALCULATION
   ═══════════════════════════════════════════════ */
function calcVerdict(chanData, nicheCat) {
  const n = chanData.length;
  if (!n) return null;

  const avgVR = chanData.reduce((s, c) => s + c.viralRatio, 0) / n;
  const oldestAny = new Date(Math.min(...chanData.map((c) => c.oldestVideoDate || c.createdAt)));
  const nicheAgeMonths = monthsBetween(oldestAny, new Date());
  const pivotCount = chanData.filter((c) => c.isPivot).length;
  const pivotRatio = pivotCount / n;

  const avgSubs = chanData.reduce((s, c) => s + c.subs, 0) / n;
  const avgViews = chanData.reduce((s, c) => s + c.totalViews, 0) / n;

  let verdict, color, label;
  if (avgVR > 5 && nicheAgeMonths < 24 && pivotRatio < 0.3) {
    verdict = "golden";
    color = "green";
    label = "✨ فرصة ذهبية";
  } else if (avgVR > 2 && nicheAgeMonths < 48 && pivotRatio < 0.5) {
    verdict = "competitive";
    color = "orange";
    label = "⚡ تنافسي";
  } else {
    verdict = "saturated";
    color = "red";
    label = "🔥 مشبع";
  }

  return { avgVR: Math.round(avgVR * 100) / 100, nicheAgeMonths, pivotRatio: Math.round(pivotRatio * 100), pivotCount, avgSubs, avgViews, verdict, color, label };
}

/* ═══════════════════════════════════════════════
   MAIN APP
   ═══════════════════════════════════════════════ */
export default function App() {
  const [niche, setNiche] = useState("");
  const [urls, setUrls] = useState(["", "", ""]);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [chanData, setChanData] = useState([]);

  function setUrl(i, v) {
    const copy = [...urls];
    copy[i] = v;
    setUrls(copy);
  }

  function addUrl() { if (urls.length < 5) setUrls([...urls, ""]); }

  function removeUrl(i) {
    if (urls.length > 1) setUrls(urls.filter((_, j) => j !== i));
  }

  async function analyze() {
    if (!niche.trim()) return setError("الرجاء إدخال اسم النتش");
    const valid = urls.filter((u) => u.trim());
    if (valid.length < 1) return setError("أضف على الأقل رابط قناة منافسة واحدة");
    setError("");
    setResult(null);
    setChanData([]);
    setLoading(true);
    setStage(0);

    try {
      const parsed = valid.map((u) => parseUrl(u));

      /* Simulate 20s loading across 5 stages (4s each) */
      const loadPromise = (async () => {
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 4000));
          setStage(i + 1);
        }
      })();

      /* Real work */
      const channelIds = await Promise.all(parsed.map(resolveChannelId));
      const data = await Promise.all(channelIds.map(fetchChannelFull));
      const nicheCat = detectNiche(niche, data.map((d) => d.title));
      const verdict = calcVerdict(data, nicheCat);

      await loadPromise;

      setChanData(data);
      setResult({ ...verdict, nicheCat });
    } catch (err) {
      const msg = err.message || "خطأ";
      if (msg.includes("quota") || msg.includes("exceeded") || msg.includes("403"))
        setError("تم تجاوز حصة API اليومية. انتظر للغد.");
      else setError(msg);
      setLoading(false);
      return;
    }

    setLoading(false);
  }

  /* ─── Result Dashboard ─── */
  function renderResult() {
    if (!result) return null;
    const r = result;
    const borderColor = r.color === "green" ? "border-emerald-500/50" : r.color === "orange" ? "border-amber-500/50" : "border-red-500/50";
    const bgColor = r.color === "green" ? "bg-emerald-900/20" : r.color === "orange" ? "bg-amber-900/20" : "bg-red-900/20";
    const textColor = r.color === "green" ? "text-emerald-400" : r.color === "orange" ? "text-amber-400" : "text-red-400";
    const badgeBg = r.color === "green" ? "bg-emerald-600" : r.color === "orange" ? "bg-amber-600" : "bg-red-600";

    return (
      <div className="animate-fade-in" style={{animation:"fadeIn 0.6s"}}>
        {/* Verdict Badge */}
        <div className={`text-center py-8 px-4 rounded-2xl border ${borderColor} ${bgColor} mb-6`}>
          <div className={`inline-block ${badgeBg} text-white text-2xl md:text-3xl font-bold px-8 py-4 rounded-2xl mb-4`}>
            {r.label}
          </div>
          <p className="text-gray-300 text-sm">
            {r.verdict === "golden"
              ? "نتش واعد بقنوات صاعدة حديثاً — فرصة ممتازة للدخول"
              : r.verdict === "competitive"
              ? "فرصة جيدة لكن المنافسة موجودة — تحتاج محتوى مميز"
              : "نتش مشبع بقنوات مسيطرة — صعوبة في الظهور"}
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <StatBox label="معامل الانتشار" value={`${r.avgVR}x`} sub="إجمالي مشاهدات ÷ مشتركين" />
          <StatBox label="العمر الحقيقي" value={`${r.nicheAgeMonths} شهر`} sub="من أقدم فيديو بالنتش" />
          <StatBox label="تغيير مسار" value={`${r.pivotRatio}%`} sub={`${r.pivotCount} قناة غيرت مسارها`} />
          <StatBox label="تصنيف RPM" value={`$${r.nicheCat.rpm[0]}-$${r.nicheCat.rpm[1]}`} sub={r.nicheCat.name} />
        </div>

        {/* Channel Cards */}
        <h3 className="text-white font-semibold mb-4">القنوات المحللة</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
          {chanData.map((ch) => (
            <a key={ch.channelId} href={`https://youtube.com/channel/${ch.channelId}`} target="_blank" rel="noopener noreferrer"
              className="block bg-[#111827] rounded-xl border border-gray-800 p-4 hover:border-blue-600/50 transition group">
              <div className="flex items-center gap-3 mb-3">
                {ch.thumbnail && <img src={ch.thumbnail} alt="" className="w-10 h-10 rounded-full" />}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate group-hover:text-blue-400 transition">{ch.title}</p>
                  <p className="text-xs text-gray-500">{ch.channelId.slice(0, 12)}...</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-500">مشتركين</span><br /><span className="text-white font-medium">{fmt(ch.subs)}</span></div>
                <div><span className="text-gray-500">مشاهدات</span><br /><span className="text-white font-medium">{fmt(ch.totalViews)}</span></div>
                <div><span className="text-gray-500">معامل</span><br /><span className="text-amber-400 font-medium">{ch.viralRatio}x</span></div>
                <div><span className="text-gray-500">العمر الحقيقي</span><br /><span className="text-white font-medium">{ch.trueNicheAgeMonths} شهر</span></div>
              </div>
              {ch.isPivot && <div className="mt-2 text-xs text-purple-400 font-medium">🔄 اكتشاف تغيير مسار</div>}
            </a>
          ))}
        </div>

        {/* RPM Detail */}
        <div className="bg-[#111827] rounded-xl border border-gray-800 p-4">
          <h4 className="text-white font-semibold mb-2 text-sm">تقدير الأرباح (RPM)</h4>
          <p className="text-xs text-gray-400 mb-3">
            بناءً على تصنيف: <span className="text-amber-400">{r.nicheCat.name}</span>
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="bg-gray-800/50 rounded-lg p-3">
              <span className="text-gray-400">متوسط المشتركين</span>
              <p className="text-white font-bold text-lg">{fmt(Math.round(r.avgSubs))}</p>
            </div>
            <div className="bg-gray-800/50 rounded-lg p-3">
              <span className="text-gray-400">متوسط المشاهدات</span>
              <p className="text-white font-bold text-lg">{fmt(Math.round(r.avgViews))}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function StatBox({ label, value, sub }) {
    return (
      <div className="bg-[#111827] rounded-xl border border-gray-800 p-3 text-center">
        <p className="text-xs text-gray-500 mb-1">{label}</p>
        <p className="text-lg md:text-xl font-bold text-white">{value}</p>
        {sub && <p className="text-[10px] text-gray-600 mt-0.5">{sub}</p>}
      </div>
    );
  }

  /* ─── Loading Animation ─── */
  function renderLoading() {
    const current = Math.min(stage, 4);
    return (
      <div className="py-12 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-600/20 mb-6">
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
        </div>
        <div className="space-y-5 max-w-md mx-auto">
          {STAGES.map((s, i) => (
            <div key={i} className={`flex items-center gap-3 text-sm transition-all duration-500 ${i === current ? "opacity-100" : i < current ? "opacity-40" : "opacity-20"}`}>
              <span className="text-xl">{s.icon}</span>
              <span className={i === current ? "text-white" : "text-gray-500"}>{s.text}</span>
              {i < current && <span className="mr-auto text-emerald-400 text-xs">✓</span>}
              {i === current && <span className="mr-auto w-4 h-4 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ─── Render ─── */
  return (
    <div className="min-h-screen bg-[#0a0e1a] text-gray-200 p-4 flex flex-col items-center">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <header className="text-center mb-8 mt-6">
          <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
            <span className="text-blue-500">Niche</span>{" "}
            <span className="text-amber-400">Radar</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm md:text-base">
            أداة تحليل النتش الذكية — اعرف جدوى أي نتش قبل البدء فيه
          </p>
        </header>

        {/* Input */}
        <section className="bg-[#111827] rounded-2xl p-4 md:p-6 mb-6 shadow-lg border border-gray-800">
          <div className="mb-4">
            <label className="block text-xs text-gray-400 mb-1">اسم النتش</label>
            <input type="text" value={niche} onChange={(e) => setNiche(e.target.value)}
              placeholder="مثال: تاريخ إسلامي"
              className="w-full bg-[#1e293b] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition" />
          </div>

          <label className="block text-xs text-gray-400 mb-2">روابط قنوات منافسة (3-5)</label>
          <div className="space-y-2 mb-3">
            {urls.map((u, i) => (
              <div key={i} className="flex gap-2">
                <input type="text" value={u} onChange={(e) => setUrl(i, e.target.value)}
                  placeholder={`https://youtube.com/@channel${i + 1}`}
                  className="flex-1 bg-[#1e293b] border border-gray-700 rounded-xl px-4 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition" />
                {urls.length > 1 && (
                  <button onClick={() => removeUrl(i)}
                    className="text-gray-500 hover:text-red-400 px-2 text-lg">✕</button>
                )}
              </div>
            ))}
          </div>

          {urls.length < 5 && (
            <button onClick={addUrl}
              className="text-blue-400 text-xs hover:text-blue-300 transition mb-4">
              + أضف قناة أخرى
            </button>
          )}

          <button onClick={analyze} disabled={loading}
            className="w-full bg-gradient-to-l from-blue-600 to-amber-500 text-white font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50 text-sm">
            {loading ? "جارٍ التحليل..." : "🔍 تحليل النتش"}
          </button>
        </section>

        {/* Error */}
        {error && (
          <div className="bg-red-900/40 border border-red-800 text-red-300 rounded-xl px-4 py-3 mb-6 text-sm text-center">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && renderLoading()}

        {/* Result */}
        {result && renderResult()}

        {/* Footer */}
        <footer className="text-center text-gray-600 text-xs py-8 mt-6 border-t border-gray-800">
          Niche Radar &copy; 2026 — راقب، حلل، انطلق
        </footer>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
