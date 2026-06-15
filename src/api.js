const API_BASE = import.meta.env.VITE_API_URL || "";

export function getToken() {
  return localStorage.getItem("nr_token");
}

export function setToken(t) {
  if (t) localStorage.setItem("nr_token", t);
  else localStorage.removeItem("nr_token");
}

async function request(method, path, body) {
  const headers = {};
  const token = getToken();
  if (token) headers["Authorization"] = "Bearer " + token;
  if (body) headers["Content-Type"] = "application/json";

  const r = await fetch(API_BASE + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (r.status === 401) {
    setToken(null);
    window.dispatchEvent(new CustomEvent("auth:logout"));
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error || "Unauthorized");
  }

  const d = await r.json();
  if (d.error) throw new Error(d.error.message || d.error || "API Error");
  return d;
}

export const api = {
  get: (path) => request("GET", path),
  post: (path, body) => request("POST", path, body),
};
