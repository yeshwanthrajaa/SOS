/**
 * SOS Guardian - Alert Dispatch & Audio Siren Service
 * Coordinates the full emergency alert workflow: GPS location fetching,
 * formatted payload composition, cancellation countdown, audio siren,
 * SMS launch, WhatsApp deep linking, and phone dialer dispatch.
 */

class AlertService {
  constructor() {
    this.audioCtx = null;
    this.activeSirenInterval = null;
    this.countdownTimer = null;
    this.isAlertInProgress = false;
  }

  _getAudioContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.audioCtx = new AudioContext();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Play synthesized emergency pulsating alarm using Web Audio API.
   * Runs natively on mobile and desktop without external audio assets.
   */
  startSiren() {
    try {
      const ctx = this._getAudioContext();
      if (!ctx) return;

      this.stopSiren();

      const playChirp = (freq, duration) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(freq * 1.5, ctx.currentTime + duration);

        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start();
        osc.stop(ctx.currentTime + duration);
      };

      // Play emergency pulse every 400ms
      playChirp(880, 0.25);
      this.activeSirenInterval = setInterval(() => {
        playChirp(950, 0.22);
      }, 400);
    } catch (e) {
      console.warn('Audio siren could not be played:', e);
    }
  }

  stopSiren() {
    if (this.activeSirenInterval) {
      clearInterval(this.activeSirenInterval);
      this.activeSirenInterval = null;
    }
  }

  /**
   * Compose the exact emergency message payload as specified in specifications
   */
  buildEmergencyMessage(emergencyType, locationResult) {
    let baseText = '';

    if (emergencyType.id === 'crime') {
      baseText = 'CRIME & SAFETY EMERGENCY! I am in immediate danger and need urgent intervention.';
    } else if (emergencyType.id === 'medical') {
      baseText = 'MEDICAL EMERGENCY! I need urgent medical assistance.';
    } else if (emergencyType.id === 'fire') {
      baseText = 'FIRE EMERGENCY! Fire assistance is needed urgently.';
    } else {
      baseText = `SOS EMERGENCY ALERT: ${emergencyType.label}! Immediate assistance needed.`;
    }

    let locationText = '';
    if (locationResult && locationResult.available) {
      locationText = `\n\n📍 My current location is:\nLatitude: ${locationResult.latitude}\nLongitude: ${locationResult.longitude}\nGoogle Maps: ${locationResult.mapUrl}\nAccuracy: ±${locationResult.accuracy}m`;
    } else {
      locationText = `\n\n📍 Location Status: GPS coordinates unavailable at time of alert (${locationResult?.error || 'No fix'}).`;
    }

    const timeStamp = `\nTimestamp: ${new Date().toLocaleTimeString()} ${new Date().toLocaleDateString()}`;
    const footer = `\n[Sent via SOS Guardian Smart Alert]`;

    return `${baseText}${locationText}${timeStamp}${footer}`;
  }

  /**
   * Starts emergency cancellation countdown
   */
  startCountdown({
    emergencyType,
    seconds,
    onTick,
    onCancelled,
    onConfirmed,
  }) {
    this.isAlertInProgress = true;
    let remaining = seconds;

    const settings = window.storageService.getSettings();
    if (settings.audioAlert) {
      this.startSiren();
    }

    onTick(remaining);

    if (remaining <= 0) {
      this.stopSiren();
      onConfirmed();
      return;
    }

    this.countdownTimer = setInterval(() => {
      remaining -= 1;
      onTick(remaining);

      if (remaining <= 0) {
        this.cancelCountdown();
        this.stopSiren();
        onConfirmed();
      }
    }, 1000);

    this._activeCancelCallback = () => {
      this.cancelCountdown();
      this.stopSiren();
      this.isAlertInProgress = false;
      onCancelled();
    };
  }

  cancelCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
    this.stopSiren();
    this.isAlertInProgress = false;
  }

  abortActiveAlert() {
    if (this._activeCancelCallback) {
      this._activeCancelCallback();
      this._activeCancelCallback = null;
    }
  }

  /**
   * Executes the full alert sequence: SMS, WhatsApp, and Phone Call
   */
  async executeAlertSequence({ emergencyType, onActionUpdate }) {
    const contact = window.storageService.getContact();
    const settings = window.storageService.getSettings();
    const isTestMode = settings.testMode;

    const actionReport = {
      emergencyType: emergencyType.label,
      targetContact: contact.name,
      targetPhone: contact.phone,
      testMode: isTestMode,
      steps: [],
    };

    const addStep = (name, status, details, link = null) => {
      const step = { name, status, details, link, time: new Date().toLocaleTimeString() };
      actionReport.steps.push(step);
      if (onActionUpdate) onActionUpdate({ ...actionReport });
    };

    // Step 1: Emergency Identification
    addStep('1. Emergency Classification', 'COMPLETED', `${emergencyType.label} (${emergencyType.code}) identified.`);

    // Step 2: Retrieve GPS Location
    addStep('2. GPS Location Acquisition', 'IN_PROGRESS', 'Querying device GPS sensors...');
    const location = await window.locationService.getCurrentLocation(4500);

    if (location.available) {
      addStep(
        '2. GPS Location Acquisition',
        'COMPLETED',
        `Coordinates acquired: ${location.latitude}, ${location.longitude} (±${location.accuracy}m)`,
        location.mapUrl
      );
    } else {
      addStep(
        '2. GPS Location Acquisition',
        'FALLBACK',
        `GPS unavailable: ${location.error || 'Timeout'}. Proceeding with alert immediately.`
      );
    }

    // Prepare full text
    const fullMessage = this.buildEmergencyMessage(emergencyType, location);
    const cleanPhone = contact.phone.replace(/[^0-9+]/g, '');

    // Step 3: SMS Dispatch
    const encodedBody = encodeURIComponent(fullMessage);
    // iOS uses &body= while Android / standard uses ?body=
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const smsUrl = isIOS ? `sms:${cleanPhone}&body=${encodedBody}` : `sms:${cleanPhone}?body=${encodedBody}`;

    if (isTestMode) {
      addStep(
        '3. Emergency SMS',
        'TEST_SIMULATED',
        `[TEST MODE] SMS payload prepared for ${cleanPhone}. Real transmission suppressed.`
      );
    } else {
      addStep(
        '3. Emergency SMS',
        'LAUNCHED',
        `Platform SMS messenger opened with emergency payload for ${cleanPhone}. User confirmation required by OS security.`,
        smsUrl
      );
      this._launchIntent(smsUrl);
    }

    // Step 4: WhatsApp Deep Link
    // Wait briefly so browser doesn't block back-to-back link triggers
    await new Promise((r) => setTimeout(r, 600));

    const waPhone = cleanPhone.replace(/^\+/, ''); // wa.me requires digits without leading '+'
    const waUrl = `https://wa.me/${waPhone}?text=${encodedBody}`;

    if (isTestMode) {
      addStep(
        '4. WhatsApp Message',
        'TEST_SIMULATED',
        `[TEST MODE] WhatsApp deep link prepared for ${waPhone}. No real message dispatched.`
      );
    } else {
      addStep(
        '4. WhatsApp Message',
        'LAUNCHED',
        `WhatsApp conversation opened with prefilled emergency coordinates.`,
        waUrl
      );
      this._launchIntent(waUrl);
    }

    // Step 5: Phone Call
    await new Promise((r) => setTimeout(r, 1000));
    const telUrl = `tel:${cleanPhone}`;

    if (isTestMode) {
      addStep(
        '5. Phone Call',
        'TEST_SIMULATED',
        `[TEST MODE] Phone dialer intent simulated for ${cleanPhone}. Real call suppressed.`
      );
    } else {
      addStep(
        '5. Phone Call',
        'LAUNCHED',
        `Native phone dialer launched for ${cleanPhone}. Operating system requires user to confirm call.`,
        telUrl
      );
      this._launchIntent(telUrl);
    }

    // Log the entire emergency event
    window.storageService.logIncident({
      type: emergencyType.label,
      location: location.available ? { lat: location.latitude, lng: location.longitude, mapUrl: location.mapUrl } : null,
      actions: actionReport.steps,
      testMode: isTestMode,
    });

    this.isAlertInProgress = false;
    return actionReport;
  }

  _launchIntent(url) {
    try {
      // Create a temporary hidden anchor to trigger native OS protocols
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => document.body.removeChild(a), 300);
    } catch (e) {
      console.warn('Could not launch intent directly:', e);
      window.open(url, '_blank');
    }
  }

  /**
   * Safe single-feature test methods
   */
  testSmsFeature() {
    const contact = window.storageService.getContact();
    const sampleMsg = `[SOS Guardian TEST] Diagnostic test message sent to ${contact.name} at ${new Date().toLocaleTimeString()}. System is operating normally.`;
    const cleanPhone = contact.phone.replace(/[^0-9+]/g, '');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const url = isIOS ? `sms:${cleanPhone}&body=${encodeURIComponent(sampleMsg)}` : `sms:${cleanPhone}?body=${encodeURIComponent(sampleMsg)}`;
    this._launchIntent(url);
    return { contact, message: sampleMsg };
  }

  testWhatsAppFeature() {
    const contact = window.storageService.getContact();
    const sampleMsg = `[SOS Guardian TEST] Diagnostic WhatsApp alert test to verify connectivity. Device time: ${new Date().toLocaleTimeString()}.`;
    const cleanPhone = contact.phone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(sampleMsg)}`;
    this._launchIntent(url);
    return { contact, message: sampleMsg };
  }

  testDialerFeature() {
    const contact = window.storageService.getContact();
    const cleanPhone = contact.phone.replace(/[^0-9+]/g, '');
    const url = `tel:${cleanPhone}`;
    this._launchIntent(url);
    return { contact };
  }
}

window.alertService = new AlertService();
