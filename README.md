# StreetLens for OpenStreetMap
### Full Stack Development (FSD) — Continuous Internal Assessment 2 (CIA-2)

**StreetLens** is an innovative ground-level street imagery integration for OpenStreetMap (OSM). It directly addresses the critical usability problem identified in the project benchmark: **users struggle to recognize places and verify destinations on OpenStreetMap because street-level imagery is absent from the primary browsing experience**, forcing them to disrupt their exploration workflow and navigate to external platforms.

StreetLens bridges this gap by integrating ground photography directly alongside the OpenStreetMap canvas in a responsive, contextual split-screen workspace. **All street-level photos are loaded live from [Mapillary](https://www.mapillary.com)** (Graph API v4, CC-BY-SA 4.0 imagery).

---

## 🔑 Mapillary Setup (required)

1. Create a free account and register an application at the [Mapillary Developer Dashboard](https://www.mapillary.com/dashboard/developers).
2. Copy the **Client Token** (starts with `MLY|`).
3. Either:
   - paste it into [`js/config.js`](js/config.js) (`MAPILLARY_CLIENT_TOKEN`) so every visitor of your deployed site gets imagery — client tokens are meant for browser use; or
   - paste it into the in-app **Mapillary** dialog (saved in that browser only, overrides `config.js`).

Without a token the app still loads, but shows a "Connect Mapillary" prompt instead of imagery.

---

## 🌐 Live Deployed Application

👉 **Live GitHub Pages URL:** [https://tanishasingha37657.github.io/StreetLens/](https://tanishasingha37657.github.io/StreetLens/)

---

## 🚀 How to Run Locally

1. Open your terminal in this directory:
   ```bash
   cd d:\uni\christ\trim2\FSD\MT
   ```
2. Start any local web server (e.g. Python HTTP server or Node `npx serve`):
   ```bash
   python -m http.server 8080
   ```
3. Open your browser and navigate to:
   ```
   http://localhost:8080
   ```

---

## 📋 Fulfillment of Core Academic Requirements

| Requirement | Implementation Details | File / Symbol |
| :--- | :--- | :--- |
| **At least 3 meaningful JS events** | **6 meaningful events implemented:**<br>1. `submit` on `#search-form` (validation, coordinate routing, geocoding dispatch)<br>2. `input` on `#search-input` (debounced real-time validation & ARIA feedback)<br>3. `click` on Leaflet map instance (reverse geocoding fetch & nearest camera query)<br>4. `click` on sequence stepping buttons (`#btn-prev-frame`, `#btn-next-frame`, `#btn-auto-tour`)<br>5. `pointerdown`/`pointermove`/`pointerup` on `#street-viewport` (360° panoramic drag & map FOV synchronization)<br>6. `keydown` accessibility navigation (Arrow keys for sequence, Space for tour, Esc to collapse) | [`js/app.js`](file:///d:/uni/christ/trim2/FSD/MT/js/app.js)<br>[`js/streetlens.js`](file:///d:/uni/christ/trim2/FSD/MT/js/streetlens.js)<br>[`js/map.js`](file:///d:/uni/christ/trim2/FSD/MT/js/map.js) |
| **User input form with validation & feedback** | **Two comprehensive forms:**<br>• **Primary Search Form:** Validates query length (≥2 chars), non-empty, and auto-detects/validates GPS coordinates (`lat, lon` range check [-90, +90] and [-180, +180]) with dynamic border colors, shake animations, and accessible `aria-live="polite"` feedback.<br>• **Coverage Request Modal:** Validates location name (3-60 chars), coordinates, strict email regex, request category, and notes with live 300-character countdown. | [`js/form-validation.js`](file:///d:/uni/christ/trim2/FSD/MT/js/form-validation.js)<br>[`index.html`](file:///d:/uni/christ/trim2/FSD/MT/index.html#L131-L175) |
| **Fetch API and JSON data handling** | **3 distinct Fetch & JSON pipelines:**<br>1. Featured-locations JSON (`fetch('./data/street_imagery.json')`) for the city quick-jump buttons, plus **live Mapillary Graph API** queries (`https://graph.mapillary.com/images?bbox=...`) that return photos, capture sequences, compass heading and contributor, grouped and ordered client-side.<br>2. External OpenStreetMap Nominatim Geocoding API (`https://nominatim.openstreetmap.org/search?format=json&...`) with JSON array parsing.<br>3. External Nominatim Reverse Geocoding API (`https://nominatim.openstreetmap.org/reverse?format=json&...`) to extract road & city hierarchy.<br>All fetches wrapped with `AbortController` (7-8s timeout) and HTTP error validation. | [`js/api.js`](file:///d:/uni/christ/trim2/FSD/MT/js/api.js) |
| **Error handling, loading & empty states** | • **Mapillary-specific states:** missing token, rejected token, no coverage within 1.5 km, network/timeouts.<br>• **Loading States:** Shimmer skeleton overlay (`#streetlens-loading`) & button spinners during geocoding/image retrieval.<br>• **Error Handling:** Global dismissible error banner (`#global-error-banner`) with interactive retry button, image `onerror` SVG fallback, and online/offline event listeners.<br>• **Empty State Messages:** Dedicated `<section role="status" class="empty-state">` (matching assignment specs) when no imagery exists within 1.5km, offering quick teleport links and a prefilled 1-click coverage request button. | [`index.html`](file:///d:/uni/christ/trim2/FSD/MT/index.html#L318-L352)<br>[`css/styles.css`](file:///d:/uni/christ/trim2/FSD/MT/css/styles.css#L510-L600) |
| **Solves the identified problem** | Integrates Mapillary ground imagery side-by-side with OpenStreetMap browsing, displaying live photo points and capture-sequence lines for the visible map area (zoom ≥ 15), a field-of-view pegman, and sequence stepping. | Complete System |

---

## 🗺️ Featured Locations

The quick-jump buttons in [`data/street_imagery.json`](data/street_imagery.json) centre the map on London (Westminster), Bengaluru (MG Road / Brigade Road), Paris (Champs-Élysées), Tokyo (Shibuya) and New York (Times Square), then load whatever Mapillary has there. Click anywhere else on the map, or search a place or `lat, lon`, to look up imagery elsewhere. Coverage varies by location; empty areas show an empty state.

---

## 📂 Source Code Architecture

```
d:/uni/christ/trim2/FSD/MT/
├── index.html                       # Semantic HTML5 layout (side-by-side workspace)
├── css/
│   └── styles.css                  # Modern Vanilla CSS design system & dark mode tokens
├── js/
│   ├── app.js                      # Application coordinator & state management
│   ├── config.js                   # Mapillary client token (optional default)
│   ├── api.js                      # Fetch API layer: Mapillary Graph API, Nominatim geocoding
│   ├── map.js                      # Leaflet OSM map controller, pegman & FOV directional cone
│   ├── streetlens.js               # Street viewer controller, 360° pan, auto-tour & compass
│   └── form-validation.js          # Client-side validation, regex checks & coverage request modal
├── data/
│   └── street_imagery.json         # Featured locations (no photos; imagery is live from Mapillary)
├── 2648548_FSD_CIA2_Completed.docx # Complete updated report with Part 2 and Part 3 documentation
└── README.md                       # Comprehensive project documentation
```

---

## ⌨️ Keyboard Shortcuts

- <kbd>&larr;</kbd> : Step to Previous Frame along surveyed road
- <kbd>&rarr;</kbd> : Step to Next Frame along surveyed road
- <kbd>Space</kbd> : Toggle Auto-Tour virtual drive
- <kbd>Esc</kbd> : Collapse / Expand Street Viewer panel
