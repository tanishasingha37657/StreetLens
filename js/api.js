/**
 * StreetLens API Layer
 * Handles all Fetch API operations: the featured-locations JSON, Nominatim
 * geocoding / reverse geocoding, live Mapillary street-level imagery, and
 * error management.
 */

import { MAPILLARY_CLIENT_TOKEN } from './config.js';

export const StreetLensAPI = {
  dataCache: null,
  /** Mapillary frames seen so far, keyed by frame id (needed for prev/next stepping). */
  frameCache: new Map(),

  /**
   * Fetch the featured-locations JSON (city centres for the quick-jump buttons).
   * Demonstrates Fetch API, JSON parsing, and AbortController timeout handling.
   */
  async loadStreetImagery() {
    if (this.dataCache) return this.dataCache;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);

    try {
      const response = await fetch('./data/street_imagery.json', {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Failed to load featured locations (HTTP ${response.status}: ${response.statusText})`);
      }

      const json = await response.json();
      this.dataCache = json;

      return json;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timed out while loading featured locations.');
      }
      throw error;
    }
  },

  /**
   * Geocode a place name, address, or landmark using OpenStreetMap Nominatim API.
   * Demonstrates external Fetch API with custom User-Agent, error handling & JSON handling.
   */
  async searchPlace(query) {
    if (!query || typeof query !== 'string' || !query.trim()) {
      throw new Error('Search query cannot be empty.');
    }

    const trimmedQuery = query.trim();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&limit=5&q=${encodeURIComponent(trimmedQuery)}`;
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'StreetLens-OSM-CIA2-App/1.0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Geocoding service unavailable (HTTP ${response.status})`);
      }

      const results = await response.json();

      if (!Array.isArray(results) || results.length === 0) {
        return [];
      }

      return results.map(item => ({
        lat: parseFloat(item.lat),
        lon: parseFloat(item.lon),
        displayName: item.display_name,
        type: item.type,
        address: item.address || {},
        importance: item.importance || 0
      }));
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Geocoding request timed out. Please check your internet connection and try again.');
      }
      throw error;
    }
  },

  /**
   * Reverse geocode a latitude & longitude into a human-readable street address.
   */
  async reverseGeocode(lat, lon) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`;
      
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'StreetLens-OSM-CIA2-App/1.0'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Reverse geocode failed with HTTP status ${response.status}`);
      }

      const data = await response.json();
      const addr = data.address || {};

      const streetName = addr.road || addr.pedestrian || addr.footway || addr.path || addr.cycleway || addr.suburb || 'Unnamed Road';
      const locality = addr.neighbourhood || addr.suburb || addr.city_district || addr.quarter || '';
      const city = addr.city || addr.town || addr.village || addr.municipality || '';
      const country = addr.country || '';

      return {
        displayName: data.display_name || 'Selected Location',
        streetName,
        locality,
        city,
        country,
        fullAddress: [streetName, locality, city, country].filter(Boolean).join(', ')
      };
    } catch (error) {
      clearTimeout(timeoutId);
      // Fallback object on reverse geocode error
      return {
        displayName: `Coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
        streetName: 'Map Coordinate',
        locality: '',
        city: '',
        country: '',
        fullAddress: `Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`
      };
    }
  },

  /**
   * Calculate great-circle distance between two GPS coordinates using Haversine formula (km).
   */
  calculateDistanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's mean radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  },

  /**
   * Remember frames so sequence stepping (prev / next) can look them up by id.
   */
  cacheFrames(frames) {
    frames.forEach(f => {
      const old = this.frameCache.get(f.id);
      // Keep an address we already resolved for this photo
      if (old && old.addressResolved && !f.addressResolved) {
        MapillaryService.applyAddress(f, old);
      }
      this.frameCache.set(f.id, f);
    });
  },

  /**
   * Retrieve a specific frame by its unique ID.
   */
  getFrameById(frameId) {
    return this.frameCache.get(frameId) || null;
  }
};

/**
 * Mapillary v4 Integration Service
 * The only source of street-level imagery in StreetLens. Talks to the Mapillary
 * Graph API (https://graph.mapillary.com/images) from the browser.
 */
const MAPILLARY_TOKEN_KEY = 'streetlens_mapillary_token';
const MAPILLARY_FIELDS = [
  'id', 'computed_geometry', 'geometry', 'compass_angle', 'computed_compass_angle',
  'captured_at', 'creator', 'sequence', 'is_pano', 'make', 'model',
  'thumb_1024_url', 'thumb_2048_url'
].join(',');

/** Error carrying the HTTP status so the UI can tell "bad token" from "no coverage". */
export class MapillaryError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = 'MapillaryError';
    this.status = status;
  }
}

export const MapillaryService = {
  /** A token saved from the in-app dialog wins over the one in js/config.js. */
  getToken() {
    let saved = '';
    try { saved = localStorage.getItem(MAPILLARY_TOKEN_KEY) || ''; } catch (e) { /* storage blocked */ }
    return saved || MAPILLARY_CLIENT_TOKEN || '';
  },

  setToken(token) {
    try {
      if (token && typeof token === 'string' && token.trim().length > 0) {
        localStorage.setItem(MAPILLARY_TOKEN_KEY, token.trim());
      } else {
        localStorage.removeItem(MAPILLARY_TOKEN_KEY);
      }
    } catch (e) { /* storage blocked */ }
  },

  hasToken() {
    const t = this.getToken();
    return Boolean(t && t.length > 5);
  },

  /** Build a "minLon,minLat,maxLon,maxLat" bbox string around a point. */
  bboxAround(lat, lon, radiusKm) {
    const latDelta = radiusKm / 111.32;
    const lonDelta = radiusKm / (111.32 * Math.max(Math.cos(lat * Math.PI / 180), 0.01));
    return [lon - lonDelta, lat - latDelta, lon + lonDelta, lat + latDelta];
  },

  /**
   * Low-level call: raw Mapillary image records inside a bbox [minLon, minLat, maxLon, maxLat].
   * Pass an AbortSignal to cancel (used for the map-viewport coverage layer).
   */
  async fetchImagesInBbox(bbox, { limit = 500, signal = null, timeoutMs = 9000 } = {}) {
    const token = this.getToken();
    if (!token) throw new MapillaryError('No Mapillary token configured.', 401);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true });

    try {
      const url = `https://graph.mapillary.com/images?fields=${MAPILLARY_FIELDS}` +
        `&bbox=${bbox.map(n => n.toFixed(6)).join(',')}&limit=${limit}` +
        `&access_token=${encodeURIComponent(token)}`;
      const res = await fetch(url, { signal: controller.signal });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        const msg = errJson?.error?.message || `Mapillary service returned status ${res.status}`;
        throw new MapillaryError(msg, res.status);
      }

      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : [];
    } catch (err) {
      if (err.name === 'AbortError') {
        if (signal?.aborted) throw err; // cancelled by caller, not a timeout
        throw new MapillaryError('Mapillary request timed out. Please check your network connection.', 0);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  },

  /** Attach a reverse-geocoded address (streetName / locality|suburb / city / country) to a frame. */
  applyAddress(frame, info) {
    if (!info) return frame;
    frame.streetName = info.streetName || frame.streetName;
    frame.suburb = info.locality || info.suburb || '';
    frame.city = info.city || '';
    frame.country = info.country || '';
    frame.addressResolved = true;
    return frame;
  },

  /** Convert one raw Mapillary record into a StreetLens frame (without prev/next links). */
  toFrame(item) {
    const coords = (item.computed_geometry || item.geometry)?.coordinates;
    const imageUrl = item.thumb_2048_url || item.thumb_1024_url;
    if (!coords || !imageUrl) return null;

    const heading = item.computed_compass_angle ?? item.compass_angle ?? 0;
    const device = [item.make, item.model].filter(Boolean).join(' ') ||
      (item.is_pano ? '360° Camera' : 'Mapillary Camera');

    return {
      id: `mly_${item.id}`,
      mapillaryId: String(item.id),
      sequenceId: item.sequence || `mly_seq_${item.id}`,
      sequenceIndex: 0,
      capturedMs: item.captured_at || 0,
      lat: coords[1],
      lon: coords[0],
      heading: Math.round(((heading % 360) + 360) % 360),
      pitch: 0,
      isPano: Boolean(item.is_pano),
      streetName: 'Mapillary Street Photo',
      suburb: '',
      city: '',
      country: '',
      addressResolved: false,
      capturedAt: item.captured_at ? new Date(item.captured_at).toISOString().split('T')[0] : 'Unknown date',
      contributor: item.creator?.username || 'mapillary_contributor',
      device,
      imageUrl,
      prevFrameId: null,
      nextFrameId: null,
      isMapillary: true,
      description: `Mapillary image ${item.id}`
    };
  },

  /**
   * Group frames by Mapillary sequence, order each one by capture time and link
   * prevFrameId / nextFrameId so the viewer can step along the road.
   * Returns an array of sequences (each an array of frames).
   */
  buildSequences(frames) {
    const bySeq = new Map();
    frames.forEach(f => {
      if (!bySeq.has(f.sequenceId)) bySeq.set(f.sequenceId, []);
      bySeq.get(f.sequenceId).push(f);
    });

    const sequences = [];
    bySeq.forEach(list => {
      list.sort((a, b) => a.capturedMs - b.capturedMs);
      list.forEach((f, i) => {
        f.sequenceIndex = i;
        f.prevFrameId = i > 0 ? list[i - 1].id : null;
        f.nextFrameId = i < list.length - 1 ? list[i + 1].id : null;
      });
      sequences.push(list);
    });
    return sequences;
  },

  /**
   * Find street-level imagery near a point. Searches progressively wider
   * (150 m, 600 m, then maxRadiusKm) so a click on a street picks the photo
   * actually on that street. Returns { frames, sequence, nearest, distanceMeters } where
   * `sequence` is the ordered run of photos containing the nearest image, or
   * null when Mapillary has no coverage in range.
   */
  async findNearby(lat, lon, addressInfo = null, maxRadiusKm = 1.5) {
    const radii = [0.15, 0.6, maxRadiusKm].filter((r, i, a) => r <= maxRadiusKm && a.indexOf(r) === i);

    for (const radius of radii) {
      const raw = await this.fetchImagesInBbox(this.bboxAround(lat, lon, radius), { limit: 500 });
      const frames = raw.map(item => this.toFrame(item)).filter(Boolean);
      if (frames.length === 0) continue;

      let nearest = null;
      let best = Infinity;
      frames.forEach(f => {
        const d = StreetLensAPI.calculateDistanceKm(lat, lon, f.lat, f.lon);
        if (d < best) { best = d; nearest = f; }
      });

      const sequences = this.buildSequences(frames);
      const sequence = sequences.find(seq => seq.includes(nearest)) || [nearest];
      // The geocoded street name describes the clicked street, i.e. this sequence only
      sequence.forEach(f => this.applyAddress(f, addressInfo));
      StreetLensAPI.cacheFrames(frames);

      return { frames, sequence, nearest, distanceMeters: Math.round(best * 1000) };
    }
    return null;
  }
};
