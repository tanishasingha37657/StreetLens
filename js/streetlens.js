/**
 * StreetLens Ground-Level Viewer Controller
 * Controls the street imagery viewport, interactive 360-degree panning,
 * compass heading indicator, sequence stepping, auto-tour virtual drive,
 * loading skeleton, and empty states.
 */

export class StreetLensViewer {
  constructor(options = {}) {
    this.container = document.getElementById(options.containerId || 'streetlens-panel');
    this.currentFrame = null;
    this.currentHeading = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startHeading = 0;
    this.panOffset = 0;
    this.autoTourTimer = null;
    this.isTourRunning = false;
    this.onHeadingChange = options.onHeadingChange || null;
    this.onFrameChange = options.onFrameChange || null;
    this.onRequestCoverage = options.onRequestCoverage || null;

    this.cacheDomElements();
    this.bindEvents();
  }

  cacheDomElements() {
    this.viewerSection = document.getElementById('streetlens-viewer-section');
    this.emptyStateSection = document.getElementById('streetlens-empty-state');
    this.loadingOverlay = document.getElementById('streetlens-loading');
    this.imageElem = document.getElementById('street-image');
    this.imageFigure = document.getElementById('street-figure');
    this.headingValue = document.getElementById('heading-value');
    this.compassDial = document.getElementById('compass-dial');
    this.streetNameElem = document.getElementById('meta-street-name');
    this.locationMetaElem = document.getElementById('meta-location');
    this.captureDateElem = document.getElementById('meta-capture-date');
    this.contributorElem = document.getElementById('meta-contributor');
    this.deviceElem = document.getElementById('meta-device');
    this.prevBtn = document.getElementById('btn-prev-frame');
    this.nextBtn = document.getElementById('btn-next-frame');
    this.autoTourBtn = document.getElementById('btn-auto-tour');
    this.sequenceBadge = document.getElementById('sequence-badge');
    this.simulatedBadge = document.getElementById('simulated-badge');
    this.fullscreenBtn = document.getElementById('btn-fullscreen-toggle');
    this.closeBtn = document.getElementById('btn-close-viewer');
  }

  bindEvents() {
    // 1. Interactive Panning via Pointer Events (Mouse drag / Touch swipe)
    const viewport = document.getElementById('street-viewport');
    if (viewport) {
      viewport.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
      window.addEventListener('pointermove', (e) => this.handlePointerMove(e));
      window.addEventListener('pointerup', () => this.handlePointerUp());
      viewport.addEventListener('touchstart', (e) => {
        // Prevent accidental page scrolling when panning ground imagery
        if (e.touches.length === 1) e.preventDefault();
      }, { passive: false });
    }

    // 2. Sequence Navigation Buttons (Click Events)
    if (this.prevBtn) {
      this.prevBtn.addEventListener('click', () => this.stepFrame('prev'));
    }
    if (this.nextBtn) {
      this.nextBtn.addEventListener('click', () => this.stepFrame('next'));
    }

    // 3. Auto-Tour Playback Toggle
    if (this.autoTourBtn) {
      this.autoTourBtn.addEventListener('click', () => this.toggleAutoTour());
    }

    // 4. Keyboard Navigation (Arrow keys, Space, Escape)
    window.addEventListener('keydown', (e) => this.handleKeyboardNav(e));

    // 5. Image Load and Error States
    if (this.imageElem) {
      this.imageElem.addEventListener('load', () => this.handleImageLoaded());
      this.imageElem.addEventListener('error', () => this.handleImageError());
    }

    // 6. Close / Collapse Viewer
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.closeViewer());
    }

    // 7. Fullscreen Toggle
    if (this.fullscreenBtn) {
      this.fullscreenBtn.addEventListener('click', () => this.toggleFullscreen());
    }

    // 8. Empty State "Request Coverage" button
    const requestBtn = document.getElementById('btn-empty-request-coverage');
    if (requestBtn && this.onRequestCoverage) {
      requestBtn.addEventListener('click', () => this.onRequestCoverage());
    }
  }

  /**
   * Display a specific street imagery frame with loading state & smooth transition
   */
  displayFrame(frame) {
    if (!frame) {
      this.showEmptyState();
      return;
    }

    this.currentFrame = frame;
    this.currentHeading = frame.heading || 0;
    this.panOffset = 0;

    // Show loading skeleton
    this.showLoading(true);
    this.emptyStateSection.classList.add('hidden');
    this.viewerSection.classList.remove('hidden');

    // Update metadata
    if (this.streetNameElem) this.streetNameElem.textContent = frame.streetName || 'Ground-Level Perspective';
    if (this.locationMetaElem) {
      const locText = [frame.suburb, frame.city, frame.country].filter(Boolean).join(', ');
      this.locationMetaElem.textContent = locText || 'OpenStreetMap Ground Location';
    }
    if (this.captureDateElem) this.captureDateElem.textContent = frame.capturedAt || 'Recent Survey';
    if (this.contributorElem) this.contributorElem.textContent = `@${frame.contributor || 'osm_mapper'}`;
    if (this.deviceElem) this.deviceElem.textContent = frame.device || 'Spherical Camera';

    // Show simulation tag if synthetic
    if (this.simulatedBadge) {
      if (frame.isSimulated) {
        this.simulatedBadge.classList.remove('hidden');
      } else {
        this.simulatedBadge.classList.add('hidden');
      }
    }

    // Update sequence navigation buttons
    this.updateNavigationControls();

    // Update compass and heading display
    this.updateHeadingDisplay(this.currentHeading);

    // Apply pan offset reset
    this.applyImageTransform();

    // Trigger image loading
    this.imageElem.src = frame.imageUrl;
  }

  handleImageLoaded() {
    this.showLoading(false);
    this.imageElem.classList.remove('image-error');
  }

  handleImageError() {
    this.showLoading(false);
    this.imageElem.classList.add('image-error');
    // Fallback graphic or notification
    this.imageElem.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450" viewBox="0 0 800 450"><rect fill="%231e293b" width="800" height="450"/><text fill="%2394a3b8" font-family="sans-serif" font-size="20" x="50%" y="50%" text-anchor="middle">Ground imagery preview temporarily unavailable</text></svg>';
  }

  showLoading(isLoading) {
    if (this.loadingOverlay) {
      if (isLoading) {
        this.loadingOverlay.classList.remove('hidden');
      } else {
        this.loadingOverlay.classList.add('hidden');
      }
    }
  }

  showEmptyState(customMessage = null) {
    this.stopAutoTour();
    this.showLoading(false);
    this.viewerSection.classList.add('hidden');
    this.emptyStateSection.classList.remove('hidden');

    if (customMessage) {
      const descElem = document.getElementById('empty-state-desc');
      if (descElem) descElem.textContent = customMessage;
    }
  }

  updateNavigationControls() {
    if (!this.currentFrame) return;

    if (this.prevBtn) {
      this.prevBtn.disabled = !this.currentFrame.prevFrameId;
    }
    if (this.nextBtn) {
      this.nextBtn.disabled = !this.currentFrame.nextFrameId;
    }

    if (this.sequenceBadge) {
      if (typeof this.currentFrame.sequenceIndex === 'number') {
        this.sequenceBadge.textContent = `Frame #${this.currentFrame.sequenceIndex + 1}`;
        this.sequenceBadge.classList.remove('hidden');
      } else {
        this.sequenceBadge.classList.add('hidden');
      }
    }
  }

  /**
   * Step backward or forward in the street sequence
   */
  stepFrame(direction) {
    if (!this.currentFrame) return;

    const targetFrameId = direction === 'next' ? this.currentFrame.nextFrameId : this.currentFrame.prevFrameId;
    if (targetFrameId && this.onFrameChange) {
      this.onFrameChange(targetFrameId);
    } else if (direction === 'next' && this.isTourRunning) {
      // Loop or stop auto-tour when reached sequence end
      this.stopAutoTour();
    }
  }

  /**
   * Toggle auto-tour playback mode
   */
  toggleAutoTour() {
    if (this.isTourRunning) {
      this.stopAutoTour();
    } else {
      this.startAutoTour();
    }
  }

  startAutoTour() {
    if (!this.currentFrame || !this.currentFrame.nextFrameId) return;

    this.isTourRunning = true;
    if (this.autoTourBtn) {
      this.autoTourBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>
        <span>Pause Tour</span>
      `;
      this.autoTourBtn.classList.add('is-playing');
    }

    this.autoTourTimer = setInterval(() => {
      if (this.currentFrame && this.currentFrame.nextFrameId) {
        this.stepFrame('next');
      } else {
        this.stopAutoTour();
      }
    }, 2800);
  }

  stopAutoTour() {
    this.isTourRunning = false;
    if (this.autoTourTimer) {
      clearInterval(this.autoTourTimer);
      this.autoTourTimer = null;
    }
    if (this.autoTourBtn) {
      this.autoTourBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor" class="w-4 h-4"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        <span>Auto-Tour</span>
      `;
      this.autoTourBtn.classList.remove('is-playing');
    }
  }

  /**
   * Pointer interaction for 360-degree street panning
   */
  handlePointerDown(e) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.isDragging = true;
    this.startX = e.clientX;
    this.startHeading = this.currentHeading;
    const viewport = document.getElementById('street-viewport');
    if (viewport) viewport.style.cursor = 'grabbing';
  }

  handlePointerMove(e) {
    if (!this.isDragging) return;

    const deltaX = e.clientX - this.startX;
    // Map pixels dragged to compass degrees (360 degrees full rotation)
    const degreeChange = (deltaX * 0.4);
    let newHeading = (this.startHeading - degreeChange) % 360;
    if (newHeading < 0) newHeading += 360;

    this.currentHeading = Math.round(newHeading);
    this.panOffset = deltaX;

    this.applyImageTransform();
    this.updateHeadingDisplay(this.currentHeading);

    if (this.onHeadingChange) {
      this.onHeadingChange(this.currentHeading);
    }
  }

  handlePointerUp() {
    if (this.isDragging) {
      this.isDragging = false;
      const viewport = document.getElementById('street-viewport');
      if (viewport) viewport.style.cursor = 'grab';
    }
  }

  applyImageTransform() {
    if (this.imageElem) {
      // Subtle parallax perspective shift while dragging
      const boundedShift = Math.max(-100, Math.min(100, this.panOffset * 0.25));
      this.imageElem.style.transform = `scale(1.08) translateX(${boundedShift}px)`;
    }
  }

  updateHeadingDisplay(heading) {
    if (this.headingValue) {
      const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const index = Math.round(heading / 45) % 8;
      this.headingValue.textContent = `${heading}° ${directions[index]}`;
    }

    if (this.compassDial) {
      this.compassDial.style.transform = `rotate(${-heading}deg)`;
    }
  }

  /**
   * Keyboard Navigation (Meaningful JS Event)
   */
  handleKeyboardNav(e) {
    // Avoid interfering when typing in search or input fields
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) {
      return;
    }

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        this.stepFrame('prev');
        break;
      case 'ArrowRight':
        e.preventDefault();
        this.stepFrame('next');
        break;
      case ' ':
        e.preventDefault();
        this.toggleAutoTour();
        break;
      case 'Escape':
        this.closeViewer();
        break;
    }
  }

  closeViewer() {
    this.stopAutoTour();
    const panel = document.getElementById('streetlens-panel');
    if (panel) {
      panel.classList.toggle('is-collapsed');
    }
  }

  toggleFullscreen() {
    const panel = document.getElementById('streetlens-panel');
    if (panel) {
      panel.classList.toggle('is-fullscreen');
    }
  }
}
