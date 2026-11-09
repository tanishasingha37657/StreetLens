/**
 * StreetLens Main Application
 * Coordinates all modules: API, Map, Viewer, and Form Validation.
 * Manages global application state, theme switching, demo teleports, and error handling.
 */

import { StreetLensAPI, MapillaryService, MapillaryError } from './api.js';
import { StreetLensMap } from './map.js';
import { StreetLensViewer } from './streetlens.js';
import { FormValidationManager } from './form-validation.js';

class StreetLensApp {
  constructor() {
    this.map = null;
    this.viewer = null;
    this.formManager = null;
    this.dataset = null;
    this.currentCityId = 'london';
    this.streetLensEnabled = true;
    this.coverageAbort = null;

    this.cacheDom();
    this.init();
  }

  cacheDom() {
    this.errorBanner = document.getElementById('global-error-banner');
    this.errorMessage = document.getElementById('error-banner-message');
    this.errorRetryBtn = document.getElementById('btn-error-retry');
    this.errorDismissBtn = document.getElementById('btn-error-dismiss');
    this.streetlensToggleBtn = document.getElementById('btn-toggle-streetlens');
    this.connectMapillaryBtn = document.getElementById('btn-empty-connect-mapillary');
    this.themeToggleBtn = document.getElementById('btn-toggle-theme');
    this.quickCityButtons = document.querySelectorAll('[data-city-id]');
    this.activeCityLabel = document.getElementById('current-city-label');
    this.radiusSelect = document.getElementById('search-radius');

    // Mapillary UI Elements
    this.mapillaryModal = document.getElementById('mapillary-modal');
    this.mapillaryOpenBtn = document.getElementById('btn-open-mapillary-modal');
    this.mapillaryCloseBtn = document.getElementById('mapillary-modal-close-btn');
    this.mapillaryTokenForm = document.getElementById('mapillary-token-form');
    this.mapillaryTokenInput = document.getElementById('mapillary-token-input');
    this.mapillaryClearBtn = document.getElementById('btn-clear-mapillary-token');
    this.mapillaryHeaderStatus = document.getElementById('mapillary-header-status');
    this.mapillaryFeedback = document.getElementById('mapillary-feedback');
  }

  async init() {
    this.setupTheme();
    this.updateMapillaryStatusDisplay();
    this.bindGlobalEvents();

    try {
      // 1. Initialize Map
      this.map = new StreetLensMap('osm-map-container', {
        center: [51.5015, -0.1255],
        zoom: 16,
        onMapClick: (lat, lon) => this.handleMapClick(lat, lon),
        onMarkerClick: (frame) => this.selectFrame(frame, false),
        onViewChange: (view) => this.loadCoverage(view)
      });

      // 2. Initialize Street-Level Viewer
      this.viewer = new StreetLensViewer({
        containerId: 'streetlens-panel',
        onHeadingChange: (heading) => {
          if (this.map) this.map.updateCameraHeading(heading);
        },
        onFrameChange: (frameId) => {
          const target = StreetLensAPI.getFrameById(frameId);
          if (target) {
            // Stepping along a sequence: reuse the street name instead of re-geocoding every frame
            const cur = this.viewer.currentFrame;
            if (cur && cur.addressResolved && !target.addressResolved && cur.sequenceId === target.sequenceId) {
              MapillaryService.applyAddress(target, { ...cur, locality: cur.suburb });
            }
            this.selectFrame(target);
          }
        },
        onRequestCoverage: () => {
          if (this.viewer && this.viewer.currentFrame) {
            const f = this.viewer.currentFrame;
            this.formManager.openCoverageModal(`${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}`, f.streetName);
          } else {
            this.formManager.openCoverageModal();
          }
        }
      });

      // 3. Initialize Form Validation Manager
      this.formManager = new FormValidationManager({
        onSearchSubmit: (params) => this.handleSearch(params),
        onRequestCoverageSubmit: (payload) => this.handleCoverageSubmission(payload)
      });

      // 4. Fetch featured locations via Fetch API
      await this.loadDataset();

      // 5. Load live Mapillary imagery for the starting location (London Westminster)
      await this.showLocation(51.5015, -0.1255, { silent: true });
      this.loadCoverage({ bbox: this.currentBbox(), zoom: this.map.map.getZoom() });

    } catch (error) {
      console.error('Initialization error:', error);
      this.showGlobalError(`Failed to initialize application: ${error.message}`);
    }
  }

  async loadDataset() {
    try {
      this.hideGlobalError();
      this.dataset = await StreetLensAPI.loadStreetImagery();
    } catch (err) {
      this.showGlobalError(`Dataset loading error: ${err.message}`, () => this.loadDataset());
    }
  }

  // -------------------------------------------------------------
  // SURVEY RADIUS HELPERS
  // -------------------------------------------------------------
  /**
   * Current survey radius (km) from the toolbar dropdown. Falls back to 1.5 km.
   */
  getSurveyRadiusKm() {
    const value = this.radiusSelect ? parseFloat(this.radiusSelect.value) : NaN;
    return Number.isFinite(value) && value > 0 ? value : 1.5;
  }

  /**
   * Human-friendly radius label: 0.5 -> "500 m", 1.5 -> "1.5 km".
   */
  formatRadius(km) {
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`;
  }

  bindGlobalEvents() {
    // 1. StreetLens Master Toggle button (Toolbar)
    if (this.streetlensToggleBtn) {
      this.streetlensToggleBtn.addEventListener('click', () => {
        this.streetLensEnabled = !this.streetLensEnabled;
        this.map.toggleStreetLensLayer(this.streetLensEnabled);
        this.streetlensToggleBtn.classList.toggle('is-active', this.streetLensEnabled);
        
        const statusSpan = this.streetlensToggleBtn.querySelector('.status-text');
        if (statusSpan) {
          statusSpan.textContent = this.streetLensEnabled ? 'Active' : 'Off';
        }

        if (!this.streetLensEnabled) {
          this.viewer.showEmptyState('StreetLens mode is currently paused. Toggle StreetLens on to inspect street photos.');
        } else {
          if (this.viewer.currentFrame) this.viewer.displayFrame(this.viewer.currentFrame);
          this.loadCoverage({ bbox: this.currentBbox(), zoom: this.map.map.getZoom() });
        }
      });
    }

    // 3. Theme Toggle (Light / Dark mode with local storage)
    if (this.themeToggleBtn) {
      this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    }

    // 4. Quick Featured Cities buttons
    this.quickCityButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const cityId = btn.getAttribute('data-city-id');
        this.switchCity(cityId);
      });
    });

    // 5. Error Banner Actions
    if (this.errorDismissBtn) {
      this.errorDismissBtn.addEventListener('click', () => this.hideGlobalError());
    }

    // 6. Network status detection
    window.addEventListener('online', () => {
      this.hideGlobalError();
      this.formManager.showToast('Network Restored', 'Back online. Geocoding services active.', 'success');
    });
    window.addEventListener('offline', () => {
      this.showGlobalError('You are currently offline. Street photos (Mapillary) and geocoding (Nominatim) need an internet connection.');
    });

    // 7. Mapillary API Modal Events
    if (this.mapillaryOpenBtn) {
      this.mapillaryOpenBtn.addEventListener('click', () => this.openMapillaryModal());
    }
    if (this.mapillaryCloseBtn) {
      this.mapillaryCloseBtn.addEventListener('click', () => this.closeMapillaryModal());
    }
    if (this.mapillaryModal) {
      this.mapillaryModal.addEventListener('click', (e) => {
        if (e.target === this.mapillaryModal) this.closeMapillaryModal();
      });
    }
    if (this.mapillaryTokenForm) {
      this.mapillaryTokenForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveMapillaryToken();
      });
    }
    if (this.mapillaryClearBtn) {
      this.mapillaryClearBtn.addEventListener('click', () => this.clearMapillaryToken());
    }
    if (this.connectMapillaryBtn) {
      this.connectMapillaryBtn.addEventListener('click', () => this.openMapillaryModal());
    }
  }

  /**
   * Handle user clicking anywhere on the OpenStreetMap
   */
  async handleMapClick(lat, lon) {
    if (!this.streetLensEnabled) {
      this.formManager.showToast('StreetLens Off', 'Enable StreetLens in the header to view ground photos.', 'warning');
      return;
    }
    await this.showLocation(lat, lon);
  }

  /**
   * Find the nearest Mapillary photo to a coordinate and show it (or an empty / token state).
   * The search distance comes from the "Survey Radius" dropdown.
   */
  async showLocation(lat, lon, { silent = false } = {}) {
    if (!MapillaryService.hasToken()) {
      this.map.setActiveCameraPosition(lat, lon, 0);
      this.viewer.showEmptyState(
        'Street-level photos come from Mapillary. Connect a free Mapillary client token to start browsing.',
        { needsToken: true }
      );
      return;
    }

    this.viewer.showLoading(true);

    const radiusKm = this.getSurveyRadiusKm();
    const radiusLabel = this.formatRadius(radiusKm);

    try {
      const addressInfo = await StreetLensAPI.reverseGeocode(lat, lon);
      const result = await MapillaryService.findNearby(lat, lon, addressInfo, radiusKm);

      if (result) {
        this.selectFrame(result.nearest, false);
        if (!silent) {
          this.formManager.showToast(
            'Street Photo Found',
            `${addressInfo.streetName}: nearest Mapillary photo is ${result.distanceMeters} m away (${result.sequence.length} in sequence)`,
            'success'
          );
        }
      } else {
        this.map.setActiveCameraPosition(lat, lon, 0);
        this.viewer.showEmptyState(
          `No Mapillary photos within ${radiusLabel} of "${addressInfo.streetName}". Try a larger survey radius or a main road, or add coverage by capturing with the Mapillary app.`
        );
      }
    } catch (err) {
      console.error('Error loading Mapillary imagery:', err);
      const isAuth = err instanceof MapillaryError && (err.status === 400 || err.status === 401 || err.status === 403);
      if (isAuth) {
        this.viewer.showEmptyState(
          `Mapillary rejected the token (${err.message}). Check it and save it again.`,
          { needsToken: true }
        );
      } else {
        this.viewer.showEmptyState(`Could not load Mapillary imagery: ${err.message}`);
        this.showGlobalError(`Mapillary error: ${err.message}`, () => this.showLocation(lat, lon, { silent }));
      }
    } finally {
      this.viewer.showLoading(false);
    }
  }

  currentBbox() {
    const b = this.map.map.getBounds();
    return [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
  }

  /**
   * Draw Mapillary coverage (sequence lines + photo dots) for the visible map area.
   * Only at zoom >= 15 so the request stays small; cancelled when the view changes again.
   */
  async loadCoverage({ bbox, zoom }) {
    if (!this.streetLensEnabled || !MapillaryService.hasToken()) return;

    if (this.coverageAbort) this.coverageAbort.abort();

    if (zoom < 15) {
      this.map.clearCoverage();
      return;
    }

    // Mapillary rejects very large bboxes; shrink around the centre if needed
    let [minLon, minLat, maxLon, maxLat] = bbox;
    const maxArea = 0.008;
    const area = (maxLon - minLon) * (maxLat - minLat);
    if (area > maxArea) {
      const k = Math.sqrt(maxArea / area);
      const cLon = (minLon + maxLon) / 2;
      const cLat = (minLat + maxLat) / 2;
      const hw = ((maxLon - minLon) / 2) * k;
      const hh = ((maxLat - minLat) / 2) * k;
      [minLon, minLat, maxLon, maxLat] = [cLon - hw, cLat - hh, cLon + hw, cLat + hh];
    }

    this.coverageAbort = new AbortController();
    const { signal } = this.coverageAbort;

    try {
      const raw = await MapillaryService.fetchImagesInBbox([minLon, minLat, maxLon, maxLat], { limit: 400, signal });
      if (signal.aborted) return;
      const frames = raw.map(item => MapillaryService.toFrame(item)).filter(Boolean);
      const sequences = MapillaryService.buildSequences(frames);
      StreetLensAPI.cacheFrames(frames);
      this.map.renderCoverage(sequences);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.warn('Mapillary coverage layer:', err.message);
    }
  }

  /**
   * Select an imagery frame, updating both map camera position and viewer
   */
  selectFrame(frame, panMap = true) {
    if (!frame) return;

    if (panMap) {
      this.map.flyTo(frame.lat, frame.lon, Math.max(this.map.map.getZoom(), 16));
    }

    this.map.activeFrameId = frame.id;
    this.map.setActiveCameraPosition(frame.lat, frame.lon, frame.heading || 0);
    this.viewer.displayFrame(frame);

    // Photos opened from the coverage layer have no street name yet; resolve it in the background
    if (!frame.addressResolved) {
      StreetLensAPI.reverseGeocode(frame.lat, frame.lon).then(info => {
        if (!info || info.streetName === 'Map Coordinate') return;
        MapillaryService.applyAddress(frame, info);
        if (this.viewer.currentFrame && this.viewer.currentFrame.id === frame.id) {
          this.viewer.displayFrame(frame);
        }
      });
    }
  }

  /**
   * Handle Search Form submission
   */
  async handleSearch(params) {
    this.hideGlobalError();
    
    if (params.isCoordinates) {
      // Coordinate search
      this.map.flyTo(params.lat, params.lon, 16);
      await this.handleMapClick(params.lat, params.lon);
      return;
    }

    // Text place search via Nominatim API
    try {
      const results = await StreetLensAPI.searchPlace(params.query);

      if (results.length === 0) {
        this.formManager.setFeedback(
          'search',
          'error',
          `No locations found for "${params.query}". Try a major city, landmark, or GPS coordinates.`
        );
        this.formManager.showToast('No Results', `Could not find "${params.query}" on OpenStreetMap.`, 'warning');
        return;
      }

      const topResult = results[0];
      this.formManager.showToast('Location Found', topResult.displayName.split(',')[0], 'success');
      this.map.flyTo(topResult.lat, topResult.lon, 15);

      // Inspect coverage at the found location
      await this.handleMapClick(topResult.lat, topResult.lon);

    } catch (error) {
      console.error('Search error:', error);
      this.formManager.setFeedback('search', 'error', error.message);
      this.showGlobalError(`Search error: ${error.message}`);
    }
  }

  /**
   * Switch between featured cities
   */
  switchCity(cityId) {
    if (!this.dataset || !this.dataset.cities) return;
    const city = this.dataset.cities.find(c => c.id === cityId);
    if (!city) return;

    this.currentCityId = cityId;

    // Update active button state
    this.quickCityButtons.forEach(btn => {
      btn.classList.toggle('is-active', btn.getAttribute('data-city-id') === cityId);
    });

    if (this.activeCityLabel) {
      this.activeCityLabel.textContent = city.name;
    }

    // Fly to city center
    this.map.flyTo(city.center[0], city.center[1], city.zoom || 16);

    // Load live Mapillary imagery at the city's featured spot
    this.showLocation(city.center[0], city.center[1]);
  }

  /**
   * Handle new coverage request form submission
   */
  handleCoverageSubmission(payload) {
    console.log('StreetLens Coverage Request Submitted:', payload);
    // Persist or log locally
    try {
      const existing = JSON.parse(localStorage.getItem('streetlens_requests') || '[]');
      existing.push(payload);
      localStorage.setItem('streetlens_requests', JSON.stringify(existing));
    } catch (e) {
      // Ignore localStorage issues
    }
  }

  // -------------------------------------------------------------
  // MAPILLARY MODAL & TOKEN MANAGEMENT
  // -------------------------------------------------------------
  openMapillaryModal() {
    if (!this.mapillaryModal) return;
    if (this.mapillaryTokenInput) {
      this.mapillaryTokenInput.value = MapillaryService.getToken();
    }
    if (this.mapillaryFeedback) {
      this.mapillaryFeedback.classList.add('hidden');
      this.mapillaryFeedback.textContent = '';
    }
    this.mapillaryModal.classList.remove('hidden');
    if (this.mapillaryTokenInput) this.mapillaryTokenInput.focus();
  }

  closeMapillaryModal() {
    if (this.mapillaryModal) {
      this.mapillaryModal.classList.add('hidden');
    }
  }

  saveMapillaryToken() {
    const val = this.mapillaryTokenInput ? this.mapillaryTokenInput.value.trim() : '';
    if (!val) {
      this.showMapillaryFeedback('Please enter a valid Mapillary Client Token starting with MLY|', 'error');
      return;
    }

    if (!val.startsWith('MLY|') && val.length < 15) {
      this.showMapillaryFeedback('Mapillary v4 client tokens typically begin with "MLY|". Please check your token format.', 'warning');
    }

    MapillaryService.setToken(val);
    this.updateMapillaryStatusDisplay();
    this.closeMapillaryModal();
    this.formManager.showToast('Mapillary Connected', 'Loading street photos for the current view.', 'success');
    const c = this.map.map.getCenter();
    this.showLocation(c.lat, c.lng, { silent: true });
    this.loadCoverage({ bbox: this.currentBbox(), zoom: this.map.map.getZoom() });
  }

  clearMapillaryToken() {
    MapillaryService.setToken('');
    if (this.mapillaryTokenInput) this.mapillaryTokenInput.value = '';
    this.updateMapillaryStatusDisplay();
    this.closeMapillaryModal();
    this.map.clearCoverage();
    const c = this.map.map.getCenter();
    this.showLocation(c.lat, c.lng, { silent: true });
    this.formManager.showToast('Mapillary Token Removed', MapillaryService.hasToken()
      ? 'Using the default token from config.js.'
      : 'No token set: street photos are unavailable until you reconnect.', 'info');
  }

  updateMapillaryStatusDisplay() {
    if (!this.mapillaryHeaderStatus) return;
    const has = MapillaryService.hasToken();
    if (has) {
      this.mapillaryHeaderStatus.textContent = 'Connected';
      this.mapillaryHeaderStatus.classList.add('is-active');
      if (this.mapillaryOpenBtn) this.mapillaryOpenBtn.classList.add('is-active');
    } else {
      this.mapillaryHeaderStatus.textContent = 'Not connected';
      this.mapillaryHeaderStatus.classList.remove('is-active');
      if (this.mapillaryOpenBtn) this.mapillaryOpenBtn.classList.remove('is-active');
    }
  }

  showMapillaryFeedback(msg, type = 'info') {
    if (!this.mapillaryFeedback) return;
    this.mapillaryFeedback.className = `form-feedback feedback-${type}`;
    this.mapillaryFeedback.textContent = msg;
    this.mapillaryFeedback.classList.remove('hidden');
  }

  // -------------------------------------------------------------
  // THEME & ERROR DISPLAY HELPERS
  // -------------------------------------------------------------
  setupTheme() {
    const savedTheme = localStorage.getItem('streetlens_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }

  toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const nextTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('streetlens_theme', nextTheme);
  }

  showGlobalError(message, retryCallback = null) {
    if (!this.errorBanner) return;
    this.errorMessage.textContent = message;
    this.errorBanner.classList.remove('hidden');

    if (retryCallback && this.errorRetryBtn) {
      this.errorRetryBtn.classList.remove('hidden');

      this.errorRetryBtn.onclick = () => {
        this.hideGlobalError();
        retryCallback();
      };
    } else if (this.errorRetryBtn) {
      this.errorRetryBtn.classList.add('hidden');
    }
  }

  hideGlobalError() {
    if (this.errorBanner) {
      this.errorBanner.classList.add('hidden');
    }
  }
}

// Bootstrap application on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  window.streetLensApp = new StreetLensApp();
});