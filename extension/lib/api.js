/* TubeRanke messaging client for content scripts and the popup.
   All network + token logic lives in background.js. In MV3, the extension
   service worker is exempt from CORS for hosts listed in host_permissions,
   so routing every call through the background avoids CORS entirely.
   This file attaches a global `TubeRankeAPI`. */
(function (root) {
  // prefer `chrome` (callback-capable in both Chrome and Firefox)
  const ext = (typeof chrome !== "undefined" && chrome.runtime) ? chrome : browser;

  function send(msg) {
    return new Promise((resolve, reject) => {
      ext.runtime.sendMessage(msg, (res) => {
        const err = ext.runtime.lastError;
        if (err) return reject(new Error(err.message));
        if (!res) return reject(new Error("No response from background"));
        if (res.ok) resolve(res.data);
        else reject(new Error(res.error || "Request failed"));
      });
    });
  }

  const api = {
    // session
    getToken: () => send({ type: "getToken" }),
    getUser: () => send({ type: "getUser" }),
    login: (email, password) => send({ type: "login", email, password }),
    logout: () => send({ type: "logout" }),
    me: () => send({ type: "me" }),

    // youtube data (proxied through TubeRanke, uses the user's stored key)
    channelIdFromHandle: (handle) => send({ type: "channelIdFromHandle", handle }),
    channelById: (id) => send({ type: "channelById", id }),
    search: (q) => send({ type: "search", q }),
    discoveries: () => send({ type: "discoveries" }),
    discover: (q) => send({ type: "discover", q }),

    getUsage: () => send({ type: "getUsage" }),

    // feature B
    saveReport: (title, data) => send({ type: "saveReport", title, data }),
  };

  root.TubeRankeAPI = api;
})(typeof window !== "undefined" ? window : self);
