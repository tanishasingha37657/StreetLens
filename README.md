# StreetLens for OpenStreetMap
### Full Stack Development (FSD) — Continuous Internal Assessment 2 (CIA-2)

**StreetLens** is an innovative ground-level street imagery integration for OpenStreetMap (OSM). It directly addresses the critical usability problem identified in the project benchmark: **users struggle to recognize places and verify destinations on OpenStreetMap because street-level imagery is absent from the primary browsing experience**, forcing them to disrupt their exploration workflow and navigate to external platforms.

StreetLens bridges this gap by integrating ground photography directly alongside the OpenStreetMap canvas in a responsive, contextual split-screen workspace.

---

## 🚀 Live Demo & How to Run

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
| **Fetch API and JSON data handling** | **3 distinct Fetch & JSON pipelines:**<br>1. Local GeoJSON sequence ingestion (`fetch('./data/street_imagery.json')`) with spatial indexing & Haversine distance.<br>2. External OpenStreetMap Nominatim Geocoding API (`https://nominatim.openstreetmap.org/search?format=json&...`) with JSON array parsing.<br>3. External Nominatim Reverse Geocoding API (`https://nominatim.openstreetmap.org/reverse?format=json&...`) to extract road & city hierarchy.<br>All fetches wrapped with `AbortController` (7-8s timeout) and HTTP error validation. | [`js/api.js`](file:///d:/uni/christ/trim2/FSD/MT/js/api.js) |
| **Error handling, loading & empty states** | • **Loading States:** Shimmer skeleton overlay (`#streetlens-loading`) & button spinners during geocoding/image retrieval.<br>• **Error Handling:** Global dismissible error banner (`#global-error-banner`) with interactive retry button, image `onerror` SVG fallback, and online/offline event listeners.<br>• **Empty State Messages:** Dedicated `<section role="status" class="empty-state">` (matching assignment specs) when no imagery exists within 1.5km, offering quick teleport links and a prefilled 1-click coverage request button. | [`index.html`](file:///d:/uni/christ/trim2/FSD/MT/index.html#L318-L352)<br>[`css/styles.css`](file:///d:/uni/christ/trim2/FSD/MT/css/styles.css#L510-L600) |
| **Solves the identified problem** | Integrates ground imagery side-by-side with OpenStreetMap browsing, displaying camera points, glowing survey routes, interactive 360° pan, and a field-of-view pegman on the map. | Complete System |

---

## 🗺️ Featured Survey Corridors Included

The dataset [`data/street_imagery.json`](file:///d:/uni/christ/trim2/FSD/MT/data/street_imagery.json) includes multi-frame street walking sequences for:
- 🇬🇧 **London, UK:** Parliament Street, Westminster & Whitehall
- 🇮🇳 **Bengaluru, India:** MG Road, Brigade Road Junction & Cubbon Park
- 🇫🇷 **Paris, France:** Avenue des Champs-Élysées & Arc de Triomphe
- 🇯🇵 **Tokyo, Japan:** Shibuya Scramble Crossing & Center-Gai
- 🇺🇸 **New York, USA:** Times Square, Duffy Square & Broadway

*Bonus Feature:* Enable the **Demo Sim** toggle in the top bar to preview simulated ground photogrammetry for *any* arbitrary coordinate clicked anywhere on Earth!

---

## 📂 Source Code Architecture

```
d:/uni/christ/trim2/FSD/MT/
├── index.html                       # Semantic HTML5 layout (side-by-side workspace)
├── css/
│   └── styles.css                  # Modern Vanilla CSS design system & dark mode tokens
├── js/
│   ├── app.js                      # Application coordinator & state management
│   ├── api.js                      # Fetch API layer, Nominatim geocoding & spatial calculations
│   ├── map.js                      # Leaflet OSM map controller, pegman & FOV directional cone
│   ├── streetlens.js               # Street viewer controller, 360° pan, auto-tour & compass
│   └── form-validation.js          # Client-side validation, regex checks & coverage request modal
├── data/
│   └── street_imagery.json         # GeoJSON street photo sequences & contributor metadata
├── 2648548_FSD_CIA2_Completed.docx # Complete updated report with Part 2 and Part 3 documentation
└── README.md                       # Comprehensive project documentation
```

---

## ⌨️ Keyboard Shortcuts

- <kbd>&larr;</kbd> : Step to Previous Frame along surveyed road
- <kbd>&rarr;</kbd> : Step to Next Frame along surveyed road
- <kbd>Space</kbd> : Toggle Auto-Tour virtual drive
- <kbd>Esc</kbd> : Collapse / Expand Street Viewer panel
