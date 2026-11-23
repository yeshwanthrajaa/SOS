/**
 * SOS Guardian - Alert Dispatch & Audio Siren Service
 * Coordinates the full emergency alert workflow: GPS location fetching,
 * formatted payload composition, cancellation countdown, audio siren,
 * SMS and WhatsApp backend dispatch, phone dialer launch, and audio siren.
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
      const locationLabel = locationResult.isCached ? 'last known location' : 'current location';
      const fixTime = locationResult.timestamp
        ? `\nFix time: ${new Date(locationResult.timestamp).toLocaleString()}`
        : '';
      const warning = locationResult.warning ? `\nWarning: ${locationResult.warning}` : '';
      locationText = `\n\n📍 My ${locationLabel} is:\nLatitude: ${locationResult.latitude}\nLongitude: ${locationResult.longitude}\nGoogle Maps: ${locationResult.mapUrl}\nAccuracy: ±${locationResult.accuracy}m${fixTime}${warning}`;
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
    const contacts = window.storageService.getContacts();
    const primaryContact = contacts[0];
    const settings = window.storageService.getSettings();
    const isTestMode = settings.testMode;

    const actionReport = {
      emergencyType: emergencyType.label,
      targetContact: contacts.map((contact) => contact.name).join(', '),
      targetPhone: contacts.map((contact) => contact.phone).join(', '),
      testMode: isTestMode,
      steps: [],
    };

    const addStep = (name, status, details, link = null, linkLabel = null) => {
      const step = { name, status, details, link, linkLabel, time: new Date().toLocaleTimeString() };
      actionReport.steps.push(step);
      if (onActionUpdate) onActionUpdate({ ...actionReport });
    };

    // Step 1: Emergency Identification
    addStep('1. Emergency Classification', 'COMPLETED', `${emergencyType.label} (${emergencyType.code}) identified.`);

    if (contacts.length === 0) {
      addStep('Emergency Contacts', 'FAILED', 'Add at least one emergency contact in Settings before triggering an alert.');
      this.isAlertInProgress = false;
      return actionReport;
    }

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

    // Step 3: Send SMS to each saved contact through the configured backend.
    for (const contact of contacts) {
      const cleanPhone = contact.phone.replace(/[^0-9+]/g, '');
      const stepName = `3. SMS to ${contact.name}`;
      if (isTestMode) {
        addStep(stepName, 'TEST_SIMULATED', `[TEST MODE] SMS to ${cleanPhone} was not sent.`);
      } else {
        addStep(stepName, 'IN_PROGRESS', `Sending emergency SMS to ${cleanPhone} through Twilio...`);
        try {
          const response = await fetch(
            `${window.location.protocol}//${window.location.hostname}:3001/sms`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to: cleanPhone, body: fullMessage }),
            }
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || `SMS service returned HTTP ${response.status}.`);
          }
          addStep(
            stepName,
            'ACCEPTED',
            `Twilio accepted the message for ${cleanPhone} (status: ${result.status || 'queued'}). Carrier delivery may take time.`
          );
        } catch (error) {
          addStep(
            stepName,
            'FAILED',
            error instanceof TypeError
              ? `Could not reach the SMS service for ${cleanPhone}. Start the backend and check its configuration.`
              : `SMS to ${cleanPhone} was not sent: ${error.message}`
          );
        }
      }
    }

    // Step 4: Send WhatsApp alerts through the configured Twilio WhatsApp sender.
    for (const contact of contacts) {
      const waPhone = contact.phone.replace(/[^0-9+]/g, '');
      const manualWaPhone = contact.phone.replace(/[^0-9]/g, '');
      const manualWaUrl = `https://wa.me/${manualWaPhone}?text=${encodeURIComponent(fullMessage)}`;
      const stepName = `4. WhatsApp to ${contact.name}`;
      if (isTestMode) {
        addStep(
          stepName,
          'TEST_SIMULATED',
          `[TEST MODE] WhatsApp message to ${waPhone} was not sent.`
        );
      } else {
        addStep(stepName, 'IN_PROGRESS', `Sending WhatsApp alert to ${waPhone} through Twilio...`);
        try {
          const response = await fetch(
            `${window.location.protocol}//${window.location.hostname}:3001/whatsapp`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ to: waPhone, body: fullMessage }),
            }
          );
          const result = await response.json();
          if (!response.ok) {
            throw new Error(result.error || `WhatsApp service returned HTTP ${response.status}.`);
          }
          if (['failed', 'undelivered', 'canceled'].includes(String(result.status).toLowerCase())) {
            throw new Error(`Twilio reported message status "${result.status}".`);
          }
          addStep(
            stepName,
            'ACCEPTED',
            `Twilio accepted the WhatsApp message for ${waPhone} (status: ${result.status || 'queued'}). Delivery may take time.`
          );
        } catch (error) {
          addStep(
            stepName,
            'FAILED',
            error instanceof TypeError
              ? `Could not reach the WhatsApp service for ${waPhone}. Start the backend and check its configuration. You can use the manual option below.`
              : `WhatsApp message to ${waPhone} was not sent: ${error.message} Use the manual option below.`,
            manualWaUrl,
            'Send manually in WhatsApp'
          );
        }
      }
    }

    // Step 5: Keep the call action directed at the first (primary) contact.
    const primaryPhone = primaryContact.phone.replace(/[^0-9+]/g, '');
    const telUrl = `tel:${primaryPhone}`;

    if (isTestMode) {
      addStep(
        '5. Phone Call',
        'TEST_SIMULATED',
        `[TEST MODE] Phone dialer intent simulated for primary contact ${primaryPhone}. Real call suppressed.`
      );
    } else {
      addStep(
        '5. Phone Call',
        'LAUNCHED',
        `Native phone dialer launched for primary contact ${primaryPhone}. Operating system requires user to confirm call.`,
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

  async testWhatsAppFeature() {
    const contact = window.storageService.getContact();
    const sampleMsg = `[SOS Guardian TEST] Diagnostic WhatsApp alert test to verify connectivity. Device time: ${new Date().toLocaleTimeString()}.`;
    const cleanPhone = contact.phone.replace(/[^0-9+]/g, '');
    const response = await fetch(
      `${window.location.protocol}//${window.location.hostname}:3001/whatsapp`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: cleanPhone, body: sampleMsg, testMode: true }),
      }
    );
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || `WhatsApp test returned HTTP ${response.status}.`);
    }
    return { contact, simulated: true };
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
