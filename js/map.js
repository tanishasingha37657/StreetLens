/**
 * StreetLens Map Controller
 * Integrates Leaflet with OpenStreetMap tiles, renders street imagery coverage
 * markers, camera position pegman with dynamic field-of-view (FOV) cone,
 * and handles map interaction events.
 */

export class StreetLensMap {
  constructor(containerId, options = {}) {
    this.containerId = containerId;
    this.map = null;
    this.markersLayer = null;
    this.coverageLinesLayer = null;
    this.cameraMarker = null;
    this.fovCone = null;
    this.activeFrameId = null;
    this.onMapClickCallback = options.onMapClick || null;
    this.onMarkerClickCallback = options.onMarkerClick || null;
    this.onViewChangeCallback = options.onViewChange || null;
    this.viewChangeTimer = null;
    this.streetLensEnabled = true;

    this.initMap(options.center || [51.5015, -0.1255], options.zoom || 16);
  }

  initMap(center, zoom) {
    // Initialize Leaflet map instance
    this.map = L.map(this.containerId, {
      center: center,
      zoom: zoom,
      zoomControl: false // Custom positioned zoom controls
    });

    // Add custom positioned zoom controls (top-right)
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // Standard OpenStreetMap Tile Layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a> contributors'
    }).addTo(this.map);

    // Feature group layers for coverage elements
    this.coverageLinesLayer = L.layerGroup().addTo(this.map);
    this.markersLayer = L.layerGroup().addTo(this.map);

    // Register Map Click Event (Meaningful JS Event)
    this.map.on('click', (e) => {
      if (this.onMapClickCallback) {
        this.onMapClickCallback(e.latlng.lat, e.latlng.lng);
      }
    });

    // Viewport changes (pan / zoom) -> debounced callback so the app can load Mapillary coverage
    this.map.on('moveend', () => {
      if (!this.onViewChangeCallback) return;
      clearTimeout(this.viewChangeTimer);
      this.viewChangeTimer = setTimeout(() => {
        const b = this.map.getBounds();
        this.onViewChangeCallback({
          bbox: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
          zoom: this.map.getZoom()
        });
      }, 450);
    });

    // Invalidate size on resize for seamless responsive layout
    window.addEventListener('resize', () => {
      this.map.invalidateSize();
    });
  }

  /**
   * Render Mapillary coverage: one glowing line per capture sequence plus a
   * clickable dot for every photo. `sequences` is an array of ordered frame arrays.
   */
  renderCoverage(sequences) {
    this.clearCoverage();
    if (!this.streetLensEnabled || !sequences) return;

    sequences.forEach(seq => {
      if (seq.length > 1) {
        const line = L.polyline(seq.map(f => [f.lat, f.lon]), {
          color: '#05cb63',
          weight: 5,
          opacity: 0.6,
          lineCap: 'round',
          lineJoin: 'round',
          interactive: false,
          className: 'streetlens-polyline'
        });
        this.coverageLinesLayer.addLayer(line);
      }

      seq.forEach(frame => {
        const dot = L.circleMarker([frame.lat, frame.lon], {
          radius: 6,
          color: '#ffffff',
          weight: 2,
          fillColor: '#05cb63',
          fillOpacity: 0.95
        });
        // Click on a coverage dot (Meaningful JS Event)
        dot.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          if (this.onMarkerClickCallback) this.onMarkerClickCallback(frame);
        });
        dot.bindTooltip(`<b>Mapillary</b> &middot; ${frame.capturedAt}<br><span style="font-size:11px;color:#64748b;">Click to view street photo</span>`, {
          direction: 'top',
          offset: [0, -6]
        });
        this.markersLayer.addLayer(dot);
      });
    });
  }

  /**
   * Update active camera position marker and render the rotating Field-of-View (FOV) cone
   */
  setActiveCameraPosition(lat, lon, heading = 0) {
    // Remove previous active camera marker & cone
    if (this.cameraMarker) {
      this.map.removeLayer(this.cameraMarker);
      this.cameraMarker = null;
    }

    // Custom pegman camera icon with directional arrow
    const cameraHtml = `
      <div class="camera-pegman-wrapper" style="transform: rotate(${heading}deg);">
        <div class="camera-fov-beam"></div>
        <div class="camera-pegman-core">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"></path>
          </svg>
        </div>
      </div>
    `;

    const cameraIcon = L.divIcon({
      html: cameraHtml,
      className: 'camera-pegman-icon',
      iconSize: [44, 44],
      iconAnchor: [22, 22]
    });

    this.cameraMarker = L.marker([lat, lon], {
      icon: cameraIcon,
      zIndexOffset: 1000
    }).addTo(this.map);
  }

  /**
   * Dynamically update the heading direction cone as the user pans the street-level view
   */
  updateCameraHeading(heading) {
    const pegmanElem = document.querySelector('.camera-pegman-wrapper');
    if (pegmanElem) {
      pegmanElem.style.transform = `rotate(${heading}deg)`;
    }
  }

  /**
   * Pan and zoom map smoothly to specified coordinates
   */
  flyTo(lat, lon, zoom = 16) {
    this.map.flyTo([lat, lon], zoom, {
      duration: 1.2,
      easeLinearity: 0.25
    });
  }

  /**
   * Toggle visibility of StreetLens layer
   */
  toggleStreetLensLayer(enabled) {
    this.streetLensEnabled = enabled;
    if (enabled) {
      this.map.addLayer(this.coverageLinesLayer);
      this.map.addLayer(this.markersLayer);
    } else {
      this.map.removeLayer(this.coverageLinesLayer);
      this.map.removeLayer(this.markersLayer);
      if (this.cameraMarker) {
        this.map.removeLayer(this.cameraMarker);
        this.cameraMarker = null;
      }
    }
  }

  clearCoverage() {
    this.coverageLinesLayer.clearLayers();
    this.markersLayer.clearLayers();
  }
}
