import { useState } from "react";
import { api, setToken } from "../api";

export default function RegisterPage({ onAuth, gotoLogin, t, lang }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    if (password.length < 6) { setError(t("auth_password_short")); return; }
    setError(""); setLoading(true);
    try {
      const d = await api.post("/api/auth/register", { email, password });
      setToken(d.token);
      onAuth(d.user);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center p-4" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="w-full max-w-sm bg-[#111827] rounded-2xl border border-gray-800 p-6">
        <h1 className="text-white text-xl font-bold text-center mb-6">
          <span className="text-blue-500">Niche</span> <span className="text-amber-400">Radar</span>
        </h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t("auth_email")}</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
              className="w-full bg-[#1e293b] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">{t("auth_password")}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
              className="w-full bg-[#1e293b] border border-gray-700 rounded-xl px-4 py-2.5 text-sm text-gray-200 focus:outline-none focus:border-blue-500 transition" />
          </div>
          {error && <div className="bg-red-900/40 border border-red-800 text-red-300 rounded-xl px-4 py-3 text-sm text-center">{error}</div>}
          <button type="submit" disabled={loading}
            className="w-full bg-gradient-to-l from-blue-600 to-amber-500 text-white font-semibold py-2.5 rounded-xl hover:opacity-90 transition disabled:opacity-50 text-sm">
            {loading ? t("auth_loading") : t("auth_register_btn")}
          </button>
        </form>
        <p className="text-center text-xs text-gray-500 mt-4">
          {t("auth_has_account")}{" "}
          <button onClick={gotoLogin} className="text-blue-400 hover:text-blue-300 underline">{t("auth_login_link")}</button>
        </p>
      </div>
    </div>
  );
}
