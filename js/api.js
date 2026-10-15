/**
 * StreetLens API Layer
 * Handles all Fetch API operations, JSON data extraction, Nominatim geocoding,
 * reverse geocoding, spatial nearest-neighbor search, and error management.
 */

export const StreetLensAPI = {
  dataCache: null,
  allFrames: [],

  /**
   * Fetch the local StreetLens ground-level imagery dataset.
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
        throw new Error(`Failed to load street imagery data (HTTP ${response.status}: ${response.statusText})`);
      }

      const json = await response.json();
      this.dataCache = json;

      // Flatten all frames for rapid spatial searching
      this.allFrames = [];
      if (json.cities && Array.isArray(json.cities)) {
        json.cities.forEach(city => {
          if (city.frames && Array.isArray(city.frames)) {
            city.frames.forEach(frame => {
              this.allFrames.push({
                ...frame,
                cityId: city.id,
                cityName: city.name
              });
            });
          }
        });
      }

      return json;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error('Request timed out while loading street imagery dataset.');
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
   * Find the closest street-level imagery frame to the given coordinates.
   */
  findNearestFrame(lat, lon, maxDistanceKm = 1.5) {
    if (!this.allFrames || this.allFrames.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    for (const frame of this.allFrames) {
      const dist = this.calculateDistanceKm(lat, lon, frame.lat, frame.lon);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = frame;
      }
    }

    if (nearest && minDistance <= maxDistanceKm) {
      return {
        frame: nearest,
        distanceKm: minDistance,
        distanceMeters: Math.round(minDistance * 1000)
      };
    }

    return null;
  },

  /**
   * Retrieve a specific frame by its unique ID.
   */
  getFrameById(frameId) {
    return this.allFrames.find(f => f.id === frameId) || null;
  },

  /**
   * Generate a simulated street perspective for locations where ground surveys haven't yet taken place.
   * Enables seamless demonstration of the StreetLens interface anywhere on the planet.
   */
  generateSimulatedFrame(lat, lon, addressInfo) {
    const sampleImages = [
      'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1596176530529-78163a4f7af2?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1542051841857-5f90071e7989?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1534430480872-3498386e7856?auto=format&fit=crop&w=1600&q=80'
    ];

    // Pick deterministic image based on coordinate hash
    const index = Math.abs(Math.floor((lat + lon) * 1000)) % sampleImages.length;

    return {
      id: `sim_${Date.now()}`,
      sequenceId: 'simulated_seq',
      sequenceIndex: 0,
      lat,
      lon,
      heading: Math.floor(Math.random() * 360),
      pitch: 0,
      streetName: addressInfo.streetName || 'Roadside Perspective',
      suburb: addressInfo.locality || '',
      city: addressInfo.city || 'Regional Center',
      country: addressInfo.country || 'Global',
      capturedAt: 'Recent Community Survey (Simulated Preview)',
      contributor: 'osm_open_community',
      device: 'StreetLens Mobile Survey',
      imageUrl: sampleImages[index],
      prevFrameId: null,
      nextFrameId: null,
      isSimulated: true,
      description: `Ground-level perspective of ${addressInfo.fullAddress || 'selected coordinate'}.`
    };
  }
};
