/**
 * StreetLens Main Application
 * Coordinates all modules: API, Map, Viewer, and Form Validation.
 * Manages global application state, theme switching, demo teleports, and error handling.
 */

import { StreetLensAPI } from './api.js';
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
    this.simulationMode = false;
    this.streetLensEnabled = true;

    this.cacheDom();
    this.init();
  }

  cacheDom() {
    this.errorBanner = document.getElementById('global-error-banner');
    this.errorMessage = document.getElementById('error-banner-message');
    this.errorRetryBtn = document.getElementById('btn-error-retry');
    this.errorDismissBtn = document.getElementById('btn-error-dismiss');
    this.streetlensToggleBtn = document.getElementById('btn-toggle-streetlens');
    this.simulationToggle = document.getElementById('toggle-simulation-mode');
    this.themeToggleBtn = document.getElementById('btn-toggle-theme');
    this.quickCityButtons = document.querySelectorAll('[data-city-id]');
    this.activeCityLabel = document.getElementById('current-city-label');
  }

  async init() {
    this.setupTheme();
    this.bindGlobalEvents();

    try {
      // 1. Initialize Map
      this.map = new StreetLensMap('osm-map-container', {
        center: [51.5015, -0.1255],
        zoom: 16,
        onMapClick: (lat, lon) => this.handleMapClick(lat, lon),
        onMarkerClick: (frame) => this.selectFrame(frame)
      });

      // 2. Initialize Street-Level Viewer
      this.viewer = new StreetLensViewer({
        containerId: 'streetlens-panel',
        onHeadingChange: (heading) => {
          if (this.map) this.map.updateCameraHeading(heading);
        },
        onFrameChange: (frameId) => {
          const target = StreetLensAPI.getFrameById(frameId);
          if (target) this.selectFrame(target);
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

      // 4. Fetch initial street-level imagery dataset via Fetch API
      await this.loadDataset();

      // 5. Select default initial frame (London Westminster)
      const initialFrame = StreetLensAPI.getFrameById('lon_01');
      if (initialFrame) {
        this.selectFrame(initialFrame, false);
      }

    } catch (error) {
      console.error('Initialization error:', error);
      this.showGlobalError(`Failed to initialize application: ${error.message}`);
    }
  }

  async loadDataset() {
    try {
      this.hideGlobalError();
      this.dataset = await StreetLensAPI.loadStreetImagery();
      this.map.renderCoverage(this.dataset);
    } catch (err) {
      this.showGlobalError(`Dataset loading error: ${err.message}`, () => this.loadDataset());
    }
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
        } else if (this.viewer.currentFrame) {
          this.viewer.displayFrame(this.viewer.currentFrame);
        }
      });
    }

    // 2. Simulation Mode Toggle (Strict survey vs Universal demo)
    if (this.simulationToggle) {
      this.simulationToggle.addEventListener('change', (e) => {
        this.simulationMode = e.target.checked;
        const msg = this.simulationMode
          ? 'Simulation Mode enabled: Click anywhere worldwide to generate a ground perspective preview.'
          : 'Strict Coverage Mode enabled: Only surveyed OpenStreetMap/Mapillary camera points will display.';
        this.formManager.showToast('Mode Updated', msg, 'info');
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
      this.showGlobalError('You are currently offline. Live Nominatim geocoding requires an internet connection.');
    });
  }

  /**
   * Handle user clicking anywhere on the OpenStreetMap
   */
  async handleMapClick(lat, lon) {
    if (!this.streetLensEnabled) {
      this.formManager.showToast('StreetLens Off', 'Enable StreetLens in the header to view ground photos.', 'warning');
      return;
    }

    this.viewer.showLoading(true);

    try {
      // Fetch reverse geocode information using OpenStreetMap Nominatim API
      const addressInfo = await StreetLensAPI.reverseGeocode(lat, lon);

      // Check if there is an existing surveyed frame within 1.5 km
      const nearest = StreetLensAPI.findNearestFrame(lat, lon, 1.5);

      if (nearest) {
        this.selectFrame(nearest.frame);
        this.formManager.showToast('Street Camera Found', `Viewing survey at ${nearest.frame.streetName} (${nearest.distanceMeters}m away)`, 'info');
      } else if (this.simulationMode) {
        // Universal demo mode: generate simulated ground perspective
        const simFrame = StreetLensAPI.generateSimulatedFrame(lat, lon, addressInfo);
        this.selectFrame(simFrame);
      } else {
        // Empty state: No ground imagery found in this area
        this.map.setActiveCameraPosition(lat, lon, 0);
        this.viewer.showEmptyState(
          `No ground-level imagery available within 1.5 km of "${addressInfo.streetName}". StreetLens relies on community surveys and Mapillary open imagery.`
        );
      }
    } catch (err) {
      console.error('Error handling map click:', err);
      this.viewer.showEmptyState('An error occurred while inspecting this location.');
    } finally {
      this.viewer.showLoading(false);
    }
  }

  /**
   * Select an imagery frame, updating both map camera position and viewer
   */
  selectFrame(frame, panMap = true) {
    if (!frame) return;

    if (panMap) {
      this.map.flyTo(frame.lat, frame.lon, 16);
    }

    this.map.activeFrameId = frame.id;
    this.map.setActiveCameraPosition(frame.lat, frame.lon, frame.heading || 0);
    this.viewer.displayFrame(frame);

    // Highlight matching marker in DOM if present
    document.querySelectorAll('.streetlens-marker-icon').forEach(elem => {
      elem.classList.toggle('is-active', elem.getAttribute('data-frame-id') === frame.id);
    });
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

    // Select the first frame in that city
    if (city.frames && city.frames.length > 0) {
      this.selectFrame(city.frames[0]);
    }
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
