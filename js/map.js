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

    // Invalidate size on resize for seamless responsive layout
    window.addEventListener('resize', () => {
      this.map.invalidateSize();
    });
  }

  /**
   * Render street-level coverage lines and camera markers on the OpenStreetMap
   */
  renderCoverage(dataset) {
    this.clearCoverage();
    if (!this.streetLensEnabled || !dataset || !dataset.cities) return;

    dataset.cities.forEach(city => {
      if (!city.frames || city.frames.length === 0) return;

      // Draw street sequence route line (cyan-blue glowing polyline)
      const latlngs = city.frames.map(f => [f.lat, f.lon]);
      const line = L.polyline(latlngs, {
        color: '#0284c7',
        weight: 6,
        opacity: 0.75,
        lineCap: 'round',
        lineJoin: 'round',
        className: 'streetlens-polyline'
      });
      line.bindTooltip(`StreetLens Survey: ${city.featuredLocation || city.name}`, { sticky: true });
      this.coverageLinesLayer.addLayer(line);

      // Add individual frame markers
      city.frames.forEach(frame => {
        const marker = this.createFrameMarker(frame);
        this.markersLayer.addLayer(marker);
      });
    });
  }

  /**
   * Create an interactive camera marker for an imagery frame
   */
  createFrameMarker(frame) {
    const isCurrent = frame.id === this.activeFrameId;
    const iconHtml = `
      <div class="streetlens-marker-icon ${isCurrent ? 'is-active' : ''}" data-frame-id="${frame.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="marker-svg">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
          <circle cx="12" cy="13" r="4"></circle>
        </svg>
      </div>
    `;

    const customIcon = L.divIcon({
      html: iconHtml,
      className: 'streetlens-div-icon',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    const marker = L.marker([frame.lat, frame.lon], { icon: customIcon });

    // Click event on camera marker (Meaningful JS Event)
    marker.on('click', (e) => {
      L.DomEvent.stopPropagation(e);
      if (this.onMarkerClickCallback) {
        this.onMarkerClickCallback(frame);
      }
    });

    marker.bindTooltip(`<b>${frame.streetName}</b><br><span style="font-size:11px;color:#64748b;">Click to view ground imagery</span>`, {
      direction: 'top',
      offset: [0, -10]
    });

    return marker;
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
