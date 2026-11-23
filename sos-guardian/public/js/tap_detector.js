/**
 * SOS Guardian - Multi-Tap Sequence Recognition Engine
 * Detects single, double, and triple taps reliably within a configurable detection window.
 * Distinguishes Crime (1x), Medical (2x), and Fire (3x) emergencies without multiple firings.
 */

const EMERGENCY_TYPES = {
  CRIME: {
    id: 'crime',
    label: 'Crime / Personal Safety',
    code: '1x Tap',
    color: '#EF4444', // Red
    themeClass: 'theme-crime',
    icon: 'shield-alert',
    defaultMessage: 'CRIME EMERGENCY! I am in immediate personal danger and need help urgently.',
  },
  MEDICAL: {
    id: 'medical',
    label: 'Medical Emergency',
    code: '2x Tap',
    color: '#2563EB', // Blue
    themeClass: 'theme-medical',
    icon: 'hospital',
    defaultMessage: 'MEDICAL EMERGENCY! I need urgent medical assistance.',
  },
  FIRE: {
    id: 'fire',
    label: 'Fire Emergency',
    code: '3x Tap',
    color: '#F97316', // Orange
    themeClass: 'theme-fire',
    icon: 'flame',
    defaultMessage: 'FIRE EMERGENCY! Fire assistance is needed urgently.',
  },
};

class TapDetector {
  constructor(buttonElement, options = {}) {
    this.button = buttonElement;
    this.tapWindowMs = options.tapWindowMs || 850; // Detection window (700-1000ms recommended)
    this.onTapProgress = options.onTapProgress || (() => {});
    this.onEmergencyTriggered = options.onEmergencyTriggered || (() => {});
    this.onWindowReset = options.onWindowReset || (() => {});

    this.tapCount = 0;
    this.timer = null;
    this.isLocked = false;
    this.lastTapTime = 0;

    this._bindEvents();
  }

  _bindEvents() {
    if (!this.button) return;

    // Support both touch and mouse events cleanly
    const handleTap = (e) => {
      e.preventDefault();
      this.registerTap();
    };

    // Use pointerup for unified fast touch/click response
    this.button.addEventListener('pointerdown', (e) => {
      // Add active visual state
      this.button.classList.add('btn-pressed');
    });

    const clearPressed = () => this.button.classList.remove('btn-pressed');
    this.button.addEventListener('pointerup', (e) => {
      clearPressed();
      handleTap(e);
    });
    this.button.addEventListener('pointercancel', clearPressed);
    this.button.addEventListener('pointerleave', clearPressed);
  }

  setTapWindow(ms) {
    this.tapWindowMs = Math.max(500, Math.min(2000, Number(ms) || 850));
  }

  lock() {
    this.isLocked = true;
    this.button?.classList.add('disabled-lock');
  }

  unlock() {
    this.isLocked = false;
    this.button?.classList.remove('disabled-lock');
    this.reset();
  }

  registerTap() {
    if (this.isLocked) {
      console.log('Tap detector is currently locked during an active alert.');
      return;
    }

    const now = Date.now();
    this.lastTapTime = now;
    this.tapCount += 1;

    // Visual ripple effect on button
    this._triggerHapticAndRipple();

    // Determine predicted emergency based on current tap count
    const predictedType = this._getEmergencyForCount(this.tapCount);

    // Notify listeners for immediate UI feedback (e.g. badge showing "Tap 1/3: Crime", "Tap 2/3: Medical")
    this.onTapProgress(this.tapCount, predictedType);

    // If already at 3 taps (Fire), we can start a short confirmation delay
    // to give user instant reaction while allowing window expiration
    if (this.tapCount >= 3) {
      this.tapCount = 3; // Max sequence is 3
      if (this.timer) clearTimeout(this.timer);
      
      // Short 300ms window to complete sequence
      this.timer = setTimeout(() => {
        this._finalizeSequence();
      }, 300);
      return;
    }

    // Reset the window timer for subsequent taps
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this._finalizeSequence();
    }, this.tapWindowMs);
  }

  _finalizeSequence() {
    const finalCount = this.tapCount;
    this.reset();

    if (finalCount === 0) return;

    const emergency = this._getEmergencyForCount(finalCount);
    if (emergency) {
      this.onEmergencyTriggered(emergency, finalCount);
    }
  }

  _getEmergencyForCount(count) {
    switch (count) {
      case 1:
        return EMERGENCY_TYPES.CRIME;
      case 2:
        return EMERGENCY_TYPES.MEDICAL;
      case 3:
      default:
        return EMERGENCY_TYPES.FIRE;
    }
  }

  _triggerHapticAndRipple() {
    // Web Haptic vibration if supported on mobile
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(this.tapCount === 3 ? [60, 40, 80] : [45]);
      } catch (e) {}
    }
  }

  reset() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.tapCount = 0;
    this.onWindowReset();
  }
}

window.TapDetector = TapDetector;
window.EMERGENCY_TYPES = EMERGENCY_TYPES;
