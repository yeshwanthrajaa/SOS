/**
 * SOS Guardian - Main Application Controller
 * Coordinates Tap Recognition, Location Services, Device Discovery,
 * Countdown Abort, Settings Management, and User Feedback.
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const elSosButton = document.getElementById('sosButton');
  const elTapBadge = document.getElementById('tapFeedbackBadge');
  const elTapText = document.getElementById('tapFeedbackText');
  const elTapDots = document.getElementById('tapDots');
  const elTestModeBanner = document.getElementById('testModeBanner');
  
  // Status Pills
  const elPillGps = document.getElementById('statusPillGps');
  const elPillContact = document.getElementById('statusPillContact');
  const elPillDevices = document.getElementById('statusPillDevices');

  // Overlays
  const elCountdownOverlay = document.getElementById('countdownOverlay');
  const elCountdownNumber = document.getElementById('countdownNumber');
  const elCountdownBanner = document.getElementById('countdownBanner');
  const elBtnCancelEmergency = document.getElementById('btnCancelEmergency');
  const elBtnSkipCountdown = document.getElementById('btnSkipCountdown');

  // Outcome Tracker Modal
  const elOutcomeModal = document.getElementById('outcomeModal');
  const elOutcomeTrackerList = document.getElementById('outcomeTrackerList');
  const elBtnCloseOutcome = document.getElementById('btnCloseOutcome');

  // Screens
  const elSettingsScreen = document.getElementById('settingsScreen');
  const elDevicesScreen = document.getElementById('devicesScreen');
  const elLogsScreen = document.getElementById('logsScreen');

  // Header buttons
  const elBtnOpenSettings = document.getElementById('btnOpenSettings');
  const elBtnOpenDevices = document.getElementById('btnOpenDevices');

  // Settings form elements
  const elContactName = document.getElementById('contactName');
  const elContactPhone = document.getElementById('contactPhone');
  const elContactRel = document.getElementById('contactRelationship');
  const elBtnSaveContact = document.getElementById('btnSaveContact');
  const elTapWindowSlider = document.getElementById('tapWindowSlider');
  const elTapWindowVal = document.getElementById('tapWindowVal');
  const elCountdownSlider = document.getElementById('countdownSlider');
  const elCountdownVal = document.getElementById('countdownVal');
  const elToggleTestMode = document.getElementById('toggleTestMode');
  const elToggleAudioAlert = document.getElementById('toggleAudioAlert');

  // Test Feature Buttons
  const elBtnTestSms = document.getElementById('btnTestSms');
  const elBtnTestWa = document.getElementById('btnTestWa');
  const elBtnTestCall = document.getElementById('btnTestCall');

  // Devices elements
  const elBtnScanBle = document.getElementById('btnScanBle');
  const elDevicesList = document.getElementById('devicesListContainer');

  // History logs list
  const elLogsList = document.getElementById('logsListContainer');
  const elBtnClearLogs = document.getElementById('btnClearLogs');

  // -------------------------------------------------------------
  // Initial State & Configuration Loading
  // -------------------------------------------------------------
  function refreshStatusDisplay() {
    const contact = window.storageService.getContact();
    const settings = window.storageService.getSettings();
    const connectedDevices = window.bluetoothService.getConnectedCount();

    // Emergency Contact Status
    if (contact && contact.phone) {
      elPillContact.innerHTML = `
        <span class="pill-icon">👤</span>
        <span class="pill-title">Contact</span>
        <span class="pill-value success">${contact.name || contact.phone}</span>
      `;
    } else {
      elPillContact.innerHTML = `
        <span class="pill-icon">⚠️</span>
        <span class="pill-title">Contact</span>
        <span class="pill-value danger">Not Set</span>
      `;
    }

    // Connected Devices Status
    elPillDevices.innerHTML = `
      <span class="pill-icon">📡</span>
      <span class="pill-title">Gadgets</span>
      <span class="pill-value ${connectedDevices > 0 ? 'success' : ''}">${connectedDevices} Connected</span>
    `;

    // Test Mode Banner
    if (settings.testMode) {
      elTestModeBanner.classList.add('active');
    } else {
      elTestModeBanner.classList.remove('active');
    }
  }

  // Monitor Location Status
  async function updateLocationStatus() {
    elPillGps.innerHTML = `
      <span class="pill-icon">📍</span>
      <span class="pill-title">GPS</span>
      <span class="pill-value warning">Locating...</span>
    `;
    const loc = await window.locationService.getCurrentLocation(3500);
    if (loc.available) {
      elPillGps.innerHTML = `
        <span class="pill-icon">📍</span>
        <span class="pill-title">GPS</span>
        <span class="pill-value success">Active (±${loc.accuracy}m)</span>
      `;
    } else {
      elPillGps.innerHTML = `
        <span class="pill-icon">📍</span>
        <span class="pill-title">GPS</span>
        <span class="pill-value warning">Offline/Cached</span>
      `;
    }
  }

  // -------------------------------------------------------------
  // Multi-Tap Sequence Recognition Engine Setup
  // -------------------------------------------------------------
  const settings = window.storageService.getSettings();
  const tapDetector = new window.TapDetector(elSosButton, {
    tapWindowMs: settings.tapWindowMs || 850,

    // Real-time tap progression callback
    onTapProgress: (count, predicted) => {
      elTapBadge.style.opacity = '1';
      elTapBadge.style.transform = 'scale(1.08)';

      if (count === 1) {
        elTapText.textContent = `Tap 1/3: Crime Emergency`;
        elTapDots.innerHTML = `
          <div class="tap-dot active-1"></div>
          <div class="tap-dot"></div>
          <div class="tap-dot"></div>
        `;
      } else if (count === 2) {
        elTapText.textContent = `Tap 2/3: Medical Emergency`;
        elTapDots.innerHTML = `
          <div class="tap-dot active-2"></div>
          <div class="tap-dot active-2"></div>
          <div class="tap-dot"></div>
        `;
      } else if (count >= 3) {
        elTapText.textContent = `Tap 3/3: Fire Emergency`;
        elTapDots.innerHTML = `
          <div class="tap-dot active-3"></div>
          <div class="tap-dot active-3"></div>
          <div class="tap-dot active-3"></div>
        `;
      }
    },

    // Reset indicator after window expires without triggering
    onWindowReset: () => {
      setTimeout(() => {
        elTapBadge.style.opacity = '0.75';
        elTapBadge.style.transform = 'scale(1)';
        elTapText.textContent = 'Ready (Tap 1x, 2x, or 3x)';
        elTapDots.innerHTML = `
          <div class="tap-dot"></div>
          <div class="tap-dot"></div>
          <div class="tap-dot"></div>
        `;
      }, 350);
    },

    // Trigger finalized emergency sequence
    onEmergencyTriggered: (emergencyType, tapCount) => {
      initiateEmergencyFlow(emergencyType);
    },
  });

  // -------------------------------------------------------------
  // Emergency Workflow Execution
  // -------------------------------------------------------------
  let currentTargetEmergency = null;

  function initiateEmergencyFlow(emergencyType) {
    currentTargetEmergency = emergencyType;
    tapDetector.lock();

    const currentSettings = window.storageService.getSettings();
    const countdownSecs = currentSettings.countdownSeconds;

    // Show countdown abort screen if enabled
    if (countdownSecs > 0) {
      elCountdownOverlay.classList.add('active');

      // Style banner
      elCountdownBanner.className = `alert-type-banner ${emergencyType.id}`;
      elCountdownBanner.textContent = `⚠️ ${emergencyType.label} Detected (${emergencyType.code})`;

      window.alertService.startCountdown({
        emergencyType,
        seconds: countdownSecs,
        onTick: (remaining) => {
          elCountdownNumber.textContent = remaining;
        },
        onCancelled: () => {
          elCountdownOverlay.classList.remove('active');
          tapDetector.unlock();
          console.log('Emergency cancelled by user.');
        },
        onConfirmed: () => {
          elCountdownOverlay.classList.remove('active');
          executeEmergencyDispatch(emergencyType);
        },
      });
    } else {
      // Direct execution without countdown
      executeEmergencyDispatch(emergencyType);
    }
  }

  // Cancel emergency button click
  elBtnCancelEmergency.addEventListener('click', () => {
    window.alertService.abortActiveAlert();
  });

  // Skip countdown button click
  elBtnSkipCountdown.addEventListener('click', () => {
    window.alertService.cancelCountdown();
    elCountdownOverlay.classList.remove('active');
    if (currentTargetEmergency) {
      executeEmergencyDispatch(currentTargetEmergency);
    }
  });

  // Dispatch emergency sequence and show outcome tracker
  async function executeEmergencyDispatch(emergencyType) {
    elOutcomeModal.classList.add('active');
    elOutcomeTrackerList.innerHTML = '<div style="text-align:center; padding: 20px;">Preparing emergency alert sequence...</div>';

    await window.alertService.executeAlertSequence({
      emergencyType,
      onActionUpdate: (report) => {
        renderOutcomeReport(report);
      },
    });

    tapDetector.unlock();
    refreshStatusDisplay();
  }

  function renderOutcomeReport(report) {
    let html = '';

    report.steps.forEach((step) => {
      let badgeClass = step.status.toLowerCase();
      let badgeText = step.status;

      if (step.status === 'COMPLETED') badgeText = '✓ Verified';
      if (step.status === 'LAUNCHED') badgeText = '↗ Intent Launched';
      if (step.status === 'FALLBACK') badgeText = '⚠ Fallback';
      if (step.status === 'TEST_SIMULATED') badgeText = '🧪 Test Mode';

      html += `
        <div class="tracker-item">
          <div class="tracker-item-head">
            <span class="tracker-name">${step.name}</span>
            <span class="tracker-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="tracker-details">${step.details}</div>
          ${step.link ? `<a class="tracker-link" href="${step.link}" target="_blank">View / Execute Action Intent &rarr;</a>` : ''}
        </div>
      `;
    });

    elOutcomeTrackerList.innerHTML = html;
  }

  elBtnCloseOutcome.addEventListener('click', () => {
    elOutcomeModal.classList.remove('active');
  });

  // -------------------------------------------------------------
  // Settings & Emergency Contact Management
  // -------------------------------------------------------------
  function loadSettingsIntoForm() {
    const contact = window.storageService.getContact();
    const settings = window.storageService.getSettings();

    elContactName.value = contact.name || '';
    elContactPhone.value = contact.phone || '';
    elContactRel.value = contact.relationship || 'Family';

    elTapWindowSlider.value = settings.tapWindowMs;
    elTapWindowVal.textContent = `${settings.tapWindowMs} ms`;

    elCountdownSlider.value = settings.countdownSeconds;
    elCountdownVal.textContent = `${settings.countdownSeconds} s`;

    elToggleTestMode.checked = settings.testMode;
    elToggleAudioAlert.checked = settings.audioAlert;
  }

  elBtnOpenSettings.addEventListener('click', () => {
    loadSettingsIntoForm();
    elSettingsScreen.classList.add('active');
  });

  document.querySelectorAll('.btn-close-overlay').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const targetId = btn.getAttribute('data-target');
      if (targetId) {
        document.getElementById(targetId)?.classList.remove('active');
      }
    });
  });

  elBtnSaveContact.addEventListener('click', () => {
    const rawPhone = elContactPhone.value.trim();
    const validation = window.storageService.validatePhoneNumber(rawPhone);

    if (!validation.valid) {
      alert(`Invalid Phone Number: ${validation.error}`);
      return;
    }

    window.storageService.saveContact({
      name: elContactName.value,
      phone: validation.formatted,
      relationship: elContactRel.value,
    });

    // Save slider settings
    const updated = window.storageService.saveSettings({
      tapWindowMs: Number(elTapWindowSlider.value),
      countdownSeconds: Number(elCountdownSlider.value),
      testMode: elToggleTestMode.checked,
      audioAlert: elToggleAudioAlert.checked,
    });

    tapDetector.setTapWindow(updated.tapWindowMs);
    refreshStatusDisplay();

    alert('Emergency contact & settings saved securely!');
    elSettingsScreen.classList.remove('active');
  });

  elTapWindowSlider.addEventListener('input', (e) => {
    elTapWindowVal.textContent = `${e.target.value} ms`;
  });

  elCountdownSlider.addEventListener('input', (e) => {
    elCountdownVal.textContent = `${e.target.value} s`;
  });

  // Feature safe-testing buttons
  elBtnTestSms.addEventListener('click', () => {
    window.alertService.testSmsFeature();
  });

  elBtnTestWa.addEventListener('click', () => {
    window.alertService.testWhatsAppFeature();
  });

  elBtnTestCall.addEventListener('click', () => {
    window.alertService.testDialerFeature();
  });

  // -------------------------------------------------------------
  // Nearby Devices & Gadget Discovery UI
  // -------------------------------------------------------------
  function renderDevicesList() {
    const devices = window.bluetoothService.getDeviceList();
    if (devices.length === 0) {
      elDevicesList.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted);">No devices discovered yet.</div>`;
      return;
    }

    let html = '';
    devices.forEach((dev) => {
      const isConnected = dev.status === 'connected';
      const batteryDisplay = dev.batteryLevel !== null ? `🔋 ${dev.batteryLevel}%` : '🔋 N/A';

      html += `
        <div class="device-card">
          <div class="device-header">
            <div>
              <div class="device-title">${dev.name}</div>
              <div class="device-subtitle">${dev.description}</div>
            </div>
            <span class="tracker-badge ${isConnected ? 'completed' : dev.compatible ? 'fallback' : ''}">
              ${dev.status.toUpperCase()}
            </span>
          </div>
          <div class="device-meta-row">
            <span>📶 Signal: ${dev.rssi || '-'} dBm</span>
            <span>${batteryDisplay}</span>
            <span>⏱ ${dev.lastSeen}</span>
          </div>
          <div class="device-actions">
            <button class="btn-device-toggle ${isConnected ? 'connected' : ''}" data-device-id="${dev.id}">
              ${isConnected ? 'Disconnect' : 'Connect Device'}
            </button>
            ${
              isConnected
                ? `<button class="btn-simulate-trigger" data-device-id="${dev.id}" title="Simulate Hardware Click">Trigger SOS</button>`
                : ''
            }
          </div>
        </div>
      `;
    });

    elDevicesList.innerHTML = html;

    // Attach listeners
    elDevicesList.querySelectorAll('.btn-device-toggle').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-device-id');
        await window.bluetoothService.toggleConnection(id);
      });
    });

    elDevicesList.querySelectorAll('.btn-simulate-trigger').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-device-id');
        window.bluetoothService.simulateHardwareTrigger(id, 1);
      });
    });
  }

  elBtnOpenDevices.addEventListener('click', () => {
    renderDevicesList();
    elDevicesScreen.classList.add('active');
  });

  elBtnScanBle.addEventListener('click', async () => {
    try {
      elBtnScanBle.textContent = 'Scanning BLE...';
      const dev = await window.bluetoothService.scanForRealDevice();
      if (dev) {
        alert(`Discovered & paired BLE device: ${dev.name}`);
      }
    } catch (err) {
      alert(`Bluetooth discovery notice: ${err.message}`);
    } finally {
      elBtnScanBle.textContent = 'Scan for BLE Gadgets';
      renderDevicesList();
      refreshStatusDisplay();
    }
  });

  window.addEventListener('sos:devices_updated', () => {
    renderDevicesList();
    refreshStatusDisplay();
  });

  // Listen for hardware triggers from smartwatches or BLE panic buttons
  window.addEventListener('sos:hardware_trigger', (e) => {
    const { device, tapCount } = e.detail;
    alert(`[REMOTE HARDWARE SOS RECEIVED]\nDevice: ${device.name}\nClicks: ${tapCount}`);
    const emergency = tapCount === 2 ? window.EMERGENCY_TYPES.MEDICAL : tapCount === 3 ? window.EMERGENCY_TYPES.FIRE : window.EMERGENCY_TYPES.CRIME;
    initiateEmergencyFlow(emergency);
  });

  // -------------------------------------------------------------
  // Legend Badges Click to Trigger Direct Emergency
  // -------------------------------------------------------------
  document.querySelectorAll('.mode-badge').forEach((badge) => {
    badge.addEventListener('click', () => {
      const mode = badge.getAttribute('data-mode');
      if (mode === 'crime') initiateEmergencyFlow(window.EMERGENCY_TYPES.CRIME);
      if (mode === 'medical') initiateEmergencyFlow(window.EMERGENCY_TYPES.MEDICAL);
      if (mode === 'fire') initiateEmergencyFlow(window.EMERGENCY_TYPES.FIRE);
    });
  });

  // -------------------------------------------------------------
  // Incident History Screen
  // -------------------------------------------------------------
  function renderLogs() {
    const logs = window.storageService.getLogs();
    if (logs.length === 0) {
      elLogsList.innerHTML = `<div style="text-align:center; padding: 20px; color: var(--text-muted);">No emergency incidents logged.</div>`;
      return;
    }

    let html = '';
    logs.forEach((log) => {
      html += `
        <div class="tracker-item" style="margin-bottom: 8px;">
          <div class="tracker-item-head">
            <span class="tracker-name">${log.type} ${log.testMode ? '(Test Mode)' : ''}</span>
            <span class="tracker-badge completed">${log.displayTime}</span>
          </div>
          <div class="tracker-details">
            ID: ${log.id}<br>
            ${log.location ? `Coords: ${log.location.lat}, ${log.location.lng}` : 'GPS: Unavailable'}
          </div>
        </div>
      `;
    });
    elLogsList.innerHTML = html;
  }

  document.getElementById('btnOpenLogs')?.addEventListener('click', () => {
    renderLogs();
    elLogsScreen.classList.add('active');
  });

  elBtnClearLogs?.addEventListener('click', () => {
    if (confirm('Clear all local emergency incident logs?')) {
      window.storageService.clearLogs();
      renderLogs();
    }
  });

  // Initialize
  refreshStatusDisplay();
  updateLocationStatus();
});
