/**
 * StreetLens Form Validation & Feedback Module
 * Implements real-time client-side validation, debounce handling,
 * accessible ARIA states, regex checks for place queries and GPS coordinates,
 * and handles the StreetLens Ground Coverage Request form modal.
 */

export class FormValidationManager {
  constructor(options = {}) {
    this.onSearchSubmit = options.onSearchSubmit || null;
    this.onRequestCoverageSubmit = options.onRequestCoverageSubmit || null;

    this.cacheDom();
    this.bindSearchFormEvents();
    this.bindCoverageModalEvents();
  }

  cacheDom() {
    // Search form elements
    this.searchForm = document.getElementById('search-form');
    this.searchInput = document.getElementById('search-input');
    this.searchBtn = document.getElementById('search-submit-btn');
    this.clearBtn = document.getElementById('search-clear-btn');
    this.searchFeedback = document.getElementById('search-feedback');
    this.radiusSelect = document.getElementById('search-radius');

    // Coverage request modal elements
    this.coverageModal = document.getElementById('coverage-modal');
    this.coverageForm = document.getElementById('coverage-request-form');
    this.modalCloseBtn = document.getElementById('modal-close-btn');
    this.modalCancelBtn = document.getElementById('modal-cancel-btn');
    this.openModalBtn = document.getElementById('btn-open-request-modal');
    this.reqLocationInput = document.getElementById('req-location-name');
    this.reqCoordsInput = document.getElementById('req-coordinates');
    this.reqEmailInput = document.getElementById('req-email');
    this.reqCategorySelect = document.getElementById('req-category');
    this.reqNotesInput = document.getElementById('req-notes');
    this.charCounter = document.getElementById('char-counter');
    this.coverageSubmitBtn = document.getElementById('coverage-submit-btn');
    this.toastContainer = document.getElementById('toast-container');
  }

  // -------------------------------------------------------------
  // 1. PRIMARY SEARCH FORM VALIDATION & EVENTS
  // -------------------------------------------------------------
  bindSearchFormEvents() {
    if (!this.searchForm || !this.searchInput) return;

    let debounceTimer = null;

    // Meaningful Event: Input with real-time validation & feedback
    this.searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      const value = this.searchInput.value;

      // Toggle clear button
      if (this.clearBtn) {
        if (value.length > 0) {
          this.clearBtn.classList.remove('hidden');
        } else {
          this.clearBtn.classList.add('hidden');
        }
      }

      // Debounce validation feedback to avoid spamming
      debounceTimer = setTimeout(() => {
        this.validateSearchInput(value);
      }, 250);
    });

    // Clear button click
    if (this.clearBtn) {
      this.clearBtn.addEventListener('click', () => {
        this.searchInput.value = '';
        this.searchInput.focus();
        this.clearBtn.classList.add('hidden');
        this.resetSearchFeedback();
      });
    }

    // Meaningful Event: Form Submit with prevention & validation
    this.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const value = this.searchInput.value.trim();
      const validation = this.validateSearchInput(value, true);

      if (!validation.isValid) {
        this.shakeInput(this.searchInput);
        this.searchInput.focus();
        return;
      }

      if (this.onSearchSubmit) {
        this.setSearchLoading(true);
        this.onSearchSubmit({
          query: value,
          isCoordinates: validation.isCoordinates,
          lat: validation.lat,
          lon: validation.lon,
          radiusKm: parseFloat(this.radiusSelect ? this.radiusSelect.value : 1.5)
        }).finally(() => {
          this.setSearchLoading(false);
        });
      }
    });
  }

  /**
   * Validate search string: checks for empty, length, coordinate syntax
   */
  validateSearchInput(rawVal, isSubmitting = false) {
    const val = rawVal.trim();

    if (!val) {
      if (isSubmitting) {
        this.setFeedback('search', 'error', 'Please enter a location name or GPS coordinates to search.');
        this.searchInput.setAttribute('aria-invalid', 'true');
        return { isValid: false };
      } else {
        this.resetSearchFeedback();
        return { isValid: false };
      }
    }

    // Test for coordinate format: e.g. "51.5074, -0.1278" or "12.9716, 77.5946"
    const coordRegex = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/;
    const match = val.match(coordRegex);

    if (match) {
      const lat = parseFloat(match[1]);
      const lon = parseFloat(match[2]);

      if (lat < -90 || lat > 90) {
        this.setFeedback('search', 'error', 'Latitude must be between -90 and 90 degrees.');
        this.searchInput.setAttribute('aria-invalid', 'true');
        return { isValid: false };
      }
      if (lon < -180 || lon > 180) {
        this.setFeedback('search', 'error', 'Longitude must be between -180 and 180 degrees.');
        this.searchInput.setAttribute('aria-invalid', 'true');
        return { isValid: false };
      }

      this.setFeedback('search', 'success', `Recognized GPS coordinates: ${lat.toFixed(4)}, ${lon.toFixed(4)}`);
      this.searchInput.setAttribute('aria-invalid', 'false');
      return { isValid: true, isCoordinates: true, lat, lon };
    }

    // Text location name
    if (val.length < 2) {
      this.setFeedback('search', 'warning', 'Query is too short. Enter at least 2 characters.');
      this.searchInput.setAttribute('aria-invalid', 'true');
      return { isValid: false };
    }

    this.setFeedback('search', 'success', 'Valid location query. Press Enter or click Search.');
    this.searchInput.setAttribute('aria-invalid', 'false');
    return { isValid: true, isCoordinates: false };
  }

  setFeedback(type, status, message) {
    if (type === 'search' && this.searchFeedback) {
      this.searchFeedback.className = `form-feedback feedback-${status}`;
      this.searchFeedback.textContent = message;
      this.searchFeedback.classList.remove('hidden');
    }
  }

  resetSearchFeedback() {
    if (this.searchFeedback) {
      this.searchFeedback.className = 'form-feedback hidden';
      this.searchFeedback.textContent = '';
    }
    if (this.searchInput) {
      this.searchInput.removeAttribute('aria-invalid');
    }
  }

  setSearchLoading(isLoading) {
    if (!this.searchBtn) return;
    if (isLoading) {
      this.searchBtn.disabled = true;
      this.searchBtn.innerHTML = `
        <span class="spinner-sm"></span>
        <span class="sr-only">Searching...</span>
      `;
    } else {
      this.searchBtn.disabled = false;
      this.searchBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="w-4 h-4"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
        <span>Search</span>
      `;
    }
  }

  shakeInput(elem) {
    elem.classList.add('animate-shake');
    setTimeout(() => elem.classList.remove('animate-shake'), 500);
  }

  // -------------------------------------------------------------
  // 2. COVERAGE REQUEST FORM VALIDATION & MODAL
  // -------------------------------------------------------------
  bindCoverageModalEvents() {
    if (!this.coverageModal) return;

    // Open Modal button
    if (this.openModalBtn) {
      this.openModalBtn.addEventListener('click', () => this.openCoverageModal());
    }

    // Close Modal buttons
    if (this.modalCloseBtn) {
      this.modalCloseBtn.addEventListener('click', () => this.closeCoverageModal());
    }
    if (this.modalCancelBtn) {
      this.modalCancelBtn.addEventListener('click', () => this.closeCoverageModal());
    }

    // Close when clicking modal backdrop
    this.coverageModal.addEventListener('click', (e) => {
      if (e.target === this.coverageModal) {
        this.closeCoverageModal();
      }
    });

    // Character counter on notes textarea
    if (this.reqNotesInput && this.charCounter) {
      this.reqNotesInput.addEventListener('input', () => {
        const remaining = 300 - this.reqNotesInput.value.length;
        this.charCounter.textContent = `${remaining} characters remaining`;
        if (remaining < 0) {
          this.charCounter.classList.add('text-error');
        } else {
          this.charCounter.classList.remove('text-error');
        }
      });
    }

    // Live validation on modal input fields
    const modalInputs = [this.reqLocationInput, this.reqCoordsInput, this.reqEmailInput, this.reqNotesInput];
    modalInputs.forEach(input => {
      if (!input) return;
      input.addEventListener('blur', () => this.validateField(input));
      input.addEventListener('input', () => {
        if (input.classList.contains('is-invalid')) {
          this.validateField(input);
        }
      });
    });

    // Coverage Form Submit
    if (this.coverageForm) {
      this.coverageForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const isValid = this.validateCoverageForm();

        if (!isValid) return;

        const payload = {
          locationName: this.reqLocationInput.value.trim(),
          coordinates: this.reqCoordsInput.value.trim(),
          email: this.reqEmailInput.value.trim(),
          category: this.reqCategorySelect ? this.reqCategorySelect.value : 'missing_imagery',
          notes: this.reqNotesInput.value.trim(),
          submittedAt: new Date().toISOString()
        };

        // Trigger submit callback
        if (this.onRequestCoverageSubmit) {
          this.onRequestCoverageSubmit(payload);
        }

        // Show success toast notification
        this.showToast('Coverage Request Submitted!', `Thank you for contributing to OpenStreetMap. Request #${Math.floor(1000 + Math.random() * 9000)} created.`, 'success');

        this.closeCoverageModal();
        this.coverageForm.reset();
        if (this.charCounter) this.charCounter.textContent = '300 characters remaining';
      });
    }
  }

  validateField(input) {
    const id = input.id;
    const val = input.value.trim();
    const errorElem = document.getElementById(`${id}-error`);
    let isValid = true;
    let message = '';

    if (id === 'req-location-name') {
      if (val.length < 3) {
        isValid = false;
        message = 'Please provide a valid location or road name (min 3 chars).';
      }
    } else if (id === 'req-coordinates') {
      const coordRegex = /^\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/;
      if (!coordRegex.test(val)) {
        isValid = false;
        message = 'Coordinates must be in "lat, lon" format (e.g. 12.9716, 77.5946).';
      }
    } else if (id === 'req-email') {
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(val)) {
        isValid = false;
        message = 'Please enter a valid email address.';
      }
    } else if (id === 'req-notes') {
      if (val.length < 10) {
        isValid = false;
        message = 'Please provide at least 10 characters describing the location.';
      } else if (val.length > 300) {
        isValid = false;
        message = 'Description cannot exceed 300 characters.';
      }
    }

    if (!isValid) {
      input.classList.add('is-invalid');
      input.classList.remove('is-valid');
      if (errorElem) {
        errorElem.textContent = message;
        errorElem.classList.remove('hidden');
      }
    } else {
      input.classList.remove('is-invalid');
      input.classList.add('is-valid');
      if (errorElem) {
        errorElem.textContent = '';
        errorElem.classList.add('hidden');
      }
    }

    return isValid;
  }

  validateCoverageForm() {
    let allValid = true;
    const inputs = [this.reqLocationInput, this.reqCoordsInput, this.reqEmailInput, this.reqNotesInput];
    inputs.forEach(input => {
      if (input && !this.validateField(input)) {
        allValid = false;
        this.shakeInput(input);
      }
    });
    return allValid;
  }

  openCoverageModal(prefillCoords = null, prefillLocation = null) {
    if (!this.coverageModal) return;
    if (prefillCoords && this.reqCoordsInput) {
      this.reqCoordsInput.value = prefillCoords;
    }
    if (prefillLocation && this.reqLocationInput) {
      this.reqLocationInput.value = prefillLocation;
    }
    this.coverageModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  closeCoverageModal() {
    if (!this.coverageModal) return;
    this.coverageModal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  showToast(title, message, type = 'info') {
    if (!this.toastContainer) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type} animate-fade-in`;
    toast.innerHTML = `
      <div class="toast-icon">
        ${type === 'success' ? '✓' : '!'}
      </div>
      <div class="toast-body">
        <h4 class="toast-title">${title}</h4>
        <p class="toast-desc">${message}</p>
      </div>
      <button class="toast-close" aria-label="Close notification">&times;</button>
    `;

    this.toastContainer.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', () => {
      toast.remove();
    });

    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.add('animate-fade-out');
        setTimeout(() => toast.remove(), 300);
      }
    }, 4500);
  }
}
