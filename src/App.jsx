import { useState } from "react";

const API_KEY = "AIzaSyASyKvq39AwGH6Nsa7wEpjRAW8z8JIJTDc";
const SEARCH_COUNT = 20;

async function fetchJson(url) {
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "خطأ في API");
  return data;
}

function daysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function formatNumber(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return n.toString();
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days > 30) return Math.floor(days / 30) + " شهر";
  return days + " يوم";
}

export default function App() {
  const [keyword, setKeyword] = useState("");
  const [minRatio, setMinRatio] = useState(5);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function search() {
    if (!keyword.trim()) return setError("الرجاء إدخال كلمة مفتاحية");
    setError("");
    setLoading(true);
    setVideos([]);

    try {
      const searchUrl =
        `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(keyword)}&type=video&order=date&publishedAfter=${daysAgo(90)}&maxResults=${SEARCH_COUNT}&key=${API_KEY}`;

      const searchData = await fetchJson(searchUrl);
      if (!searchData.items?.length) {
        setError("لا توجد نتائج لهذه الكلمة");
        setLoading(false);
        return;
      }

      const videoIds = searchData.items.map((i) => i.id.videoId).join(",");
      const channelIds = [...new Set(searchData.items.map((i) => i.snippet.channelId))].join(",");

      const [statsData, channelsData] = await Promise.all([
        fetchJson(
          `https://www.googleapis.com/youtube/v3/videos?part=statistics,snippet&id=${videoIds}&key=${API_KEY}`
        ),
        fetchJson(
          `https://www.googleapis.com/youtube/v3/channels?part=statistics&id=${channelIds}&key=${API_KEY}`
        ),
      ]);

      const subMap = {};
      for (const ch of channelsData.items || []) {
        subMap[ch.id] = parseInt(ch.statistics.subscriberCount, 10) || 0;
      }

      const results = [];
      for (const item of statsData.items || []) {
        const views = parseInt(item.statistics.viewCount, 10) || 0;
        const subs = subMap[item.snippet.channelId] || 1;
        const ratio = views / subs;
        if (ratio < minRatio) continue;
        results.push({
          id: item.id,
          title: item.snippet.title,
          channelTitle: item.snippet.channelTitle,
          channelId: item.snippet.channelId,
          thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.medium?.url || "",
          publishedAt: item.snippet.publishedAt,
          views,
          subs,
          ratio: Math.round(ratio * 100) / 100,
        });
      }

      results.sort((a, b) => b.ratio - a.ratio);

      if (!results.length) {
        setError(`لا توجد فيديوهات تتجاوز معامل ${minRatio}x خلال آخر 90 يوماً. جرب تقليل المعامل.`);
      } else {
        setVideos(results);
      }
    } catch (err) {
      const msg = err.message || "حدث خطأ غير متوقع"; 
      if (msg.includes("quota") || msg.includes("403") || msg.includes("exceeded")) {
        setError("تم تجاوز حصة API اليومية. انتظر حتى الغد أو استخدم مفتاح API آخر.");
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-gray-200 p-4 flex flex-col items-center">
      <div className="w-full max-w-5xl">
        <header className="text-center mb-8 mt-4">
          <h1 className="text-3xl md:text-5xl font-bold text-white tracking-tight">
            <span className="text-blue-500">Outlier</span>{" "}
            <span className="text-amber-400">Radar</span>
          </h1>
          <p className="text-gray-400 mt-2 text-sm md:text-base">
            رادار الفرص — اكتشف الفيديوهات ذات التفوق العالي في قنوات النيچ
          </p>
        </header>

        <section className="bg-[#111827] rounded-2xl p-4 md:p-6 mb-6 shadow-lg border border-gray-800">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-3">
              <label className="block text-xs text-gray-400 mb-1">الكلمة المفتاحية</label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="تاريخ إسلامي"
                className="w-full bg-[#1e293b] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">أدنى معامل تفوق (x)</label>
              <input
                type="number"
                value={minRatio}
                onChange={(e) => setMinRatio(Number(e.target.value))}
                min="1"
                className="w-full bg-[#1e293b] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition"
              />
            </div>
          </div>
          <button
            onClick={search}
            disabled={loading}
            className="mt-4 w-full bg-gradient-to-l from-blue-600 to-amber-500 text-white font-semibold py-3 rounded-xl hover:opacity-90 transition disabled:opacity-50 text-sm"
          >
            {loading ? "جارٍ البحث..." : "ابحث"}
          </button>
        </section>

        {error && (
          <div className="bg-red-900/40 border border-red-800 text-red-300 rounded-xl px-4 py-3 mb-6 text-sm text-center">
            {error}
          </div>
        )}

        {loading && (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-400 text-sm">جلب البيانات من يوتيوب...</p>
          </div>
        )}

        {videos.length > 0 && (
          <p className="text-gray-400 text-sm mb-4 text-center">
            {videos.length} فيديو تتجاوز معامل {minRatio}x
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {videos.map((v) => (
            <a
              key={v.id}
              href={`https://youtube.com/watch?v=${v.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="block bg-[#111827] rounded-2xl overflow-hidden border border-gray-800 hover:border-blue-600/50 transition group"
            >
              <div className="relative">
                <img
                  src={v.thumbnail}
                  alt={v.title}
                  className="w-full aspect-video object-cover"
                  loading="lazy"
                />
                <div className="absolute top-2 left-2 bg-amber-500/90 text-black text-xs font-bold px-2.5 py-1 rounded-full">
                  {v.ratio}x
                </div>
              </div>
              <div className="p-3">
                <h3 className="text-sm font-semibold text-white line-clamp-2 group-hover:text-blue-400 transition mb-2">
                  {v.title}
                </h3>
                <div className="text-xs text-gray-400 space-y-1">
                  <p>{v.channelTitle}</p>
                  <p className="flex justify-between">
                    <span>👁 {formatNumber(v.views)} مشاهدة</span>
                    <span>👥 {formatNumber(v.subs)} مشترك</span>
                  </p>
                  <p className="text-amber-400/80">{timeAgo(v.publishedAt)}</p>
                </div>
              </div>
            </a>
          ))}
        </div>

        <footer className="text-center text-gray-600 text-xs py-8 mt-6 border-t border-gray-800">
          Outlier Radar &copy; 2026 &mdash; راقب، حلل، انطلق 🚀
        </footer>
      </div>
    </div>
  );
}
