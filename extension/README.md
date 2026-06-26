# TubeRanke Browser Extension

A Chrome + Firefox extension for **tuberanke.com**. Three features:

| # | Feature | Where | Backend endpoint |
|---|---------|-------|------------------|
| **OUTLIER BADGES** | A badge on **every thumbnail** while you browse: true outlier multiplier (vs channel median) on channel pages, views-per-hour momentum everywhere else. 100% client-side - zero API quota. Works logged-out. | Home, Search, any channel page | none (DOM math) |
| **SORT BY OUTLIER** | On a channel page, a floating "Sort by Outlier" button reorders the video grid so the biggest outliers come first. Toggle back to original order. | Any channel /videos page | none (DOM math) |
| A | Channel stats + **Outlier score** overlay | Floating panel on any YouTube channel/video page | `/api/handle/:h`, `/api/channel/:id` |
| B | **Save idea / channel to TubeRanke** | Click any badge, or the overlay button | `POST /api/reports` (Pro) |
| C | **Niche Search + Discoveries** | The toolbar popup | `/api/search` (Pro), `/api/discoveries` (Pro) |

The badge math is locale-aware (English + Arabic, Western + Arabic-Indic digits).
The outlier multiplier uses the **median** of a channel's visible videos (more
robust than a lifetime average, and matches how outlier-hunting tools like 1of10
score videos).

Auth reuses the same TubeRanke account + JWT. YouTube data is pulled through the
site's proxy using the user's own stored YouTube API key (BYOK), so no extra key
is needed in the extension.

## Files
- `manifest.json` - MV3, works on both browsers
- `background.js` - service worker, owns all network + token storage (CORS-exempt)
- `content.js` / `content.css` - the YouTube overlay (features A + B)
- `popup.html` / `popup.css` / `popup.js` - login + niche tools (feature C)
- `lib/api.js` - messaging client shared by content + popup
- `icons/` - generated PNG icons

## Load it (Chrome / Edge)
1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top-right)
3. Click **Load unpacked** -> select this folder
4. Pin the TubeRanke icon, click it, log in with your tuberanke.com account

## Load it (Firefox)
1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on** -> select `manifest.json`
3. (Temporary add-ons clear on restart; for permanent use it must be signed via AMO)

## Test checklist
- Log in via the popup -> shows your email + plan
- Open `https://www.youtube.com/@MSPaintMoney` -> panel shows subs / views / avg
- Open one of your videos -> panel shows the **outlier multiplier** (video views vs channel avg)
- Click **Save to TubeRanke** -> appears in your reports on the site
- Popup -> **Niche Search** -> type a niche -> channels list (Pro)
- Popup -> **Discoveries** -> curated niche list (Pro)

## Note on CORS
All network calls go through the background service worker, which is exempt from
CORS for hosts in `host_permissions` (the API domain). If Firefox blocks any call,
add extension origins to the server's `CORS_ORIGIN` (see `server/index.js`) - a
ready patch is documented in the chat.
