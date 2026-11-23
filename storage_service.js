/**
 * SOS Guardian - Storage Service
 * Handles persistence for emergency contacts, preferences, and emergency incident logs.
 */

const STORAGE_KEYS = {
  CONTACT: 'sos_guardian_contact',
  SETTINGS: 'sos_guardian_settings',
  LOGS: 'sos_guardian_logs',
};

const DEFAULT_SETTINGS = {
  tapWindowMs: 850,          // 700 - 1000 ms detection window
  countdownSeconds: 4,      // Cancellation countdown (0 to disable)
  testMode: false,          // Test mode: dispatches to safe preview instead of real carrier
  audioAlert: true,         // Play audio tone during countdown
  autoDialDelay: 1000,      // Delay between WhatsApp and phone dialer
};

const DEFAULT_CONTACT = {
  name: 'Primary Emergency Contact',
  phone: '+15551234567',
  relationship: 'Family',
  configured: true,
};

class StorageService {
  constructor() {
    this._initDefaults();
  }

  _initDefaults() {
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      this.saveSettings(DEFAULT_SETTINGS);
    }
    if (!localStorage.getItem(STORAGE_KEYS.CONTACT)) {
      this.saveContact(DEFAULT_CONTACT);
    }
    if (!localStorage.getItem(STORAGE_KEYS.LOGS)) {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify([]));
    }
  }

  // Contact Operations
  getContact() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CONTACT);
      return data ? JSON.parse(data) : DEFAULT_CONTACT;
    } catch (e) {
      console.error('Error loading contact:', e);
      return DEFAULT_CONTACT;
    }
  }

  saveContact(contact) {
    if (!contact || !contact.phone) {
      throw new Error('Valid phone number is required');
    }
    // Clean and validate phone number
    const cleanPhone = contact.phone.replace(/[\s\-()]/g, '');
    const validatedContact = {
      name: (contact.name || 'Emergency Contact').trim(),
      phone: cleanPhone,
      relationship: (contact.relationship || 'Emergency Contact').trim(),
      configured: true,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEYS.CONTACT, JSON.stringify(validatedContact));
    return validatedContact;
  }

  validatePhoneNumber(phone) {
    if (!phone) return { valid: false, error: 'Phone number cannot be empty' };
    const cleaned = phone.replace(/[\s\-()]/g, '');
    // International format check (+ followed by 7 to 15 digits) or national 10-digit
    const internationalRegex = /^\+[1-9]\d{6,14}$/;
    const nationalRegex = /^[1-9]\d{9,11}$/;

    if (internationalRegex.test(cleaned)) {
      return { valid: true, formatted: cleaned };
    }
    if (nationalRegex.test(cleaned)) {
      return { valid: true, formatted: `+${cleaned}`, warning: 'Auto-prepended country code +' };
    }
    return {
      valid: false,
      error: 'Please include country code starting with + (e.g., +1234567890 or +919876543210)',
    };
  }

  // Settings Operations
  getSettings() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch (e) {
      console.error('Error loading settings:', e);
      return DEFAULT_SETTINGS;
    }
  }

  saveSettings(newSettings) {
    const current = this.getSettings();
    const updated = { ...current, ...newSettings };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    return updated;
  }

  // Emergency Audit Log Operations
  getLogs() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.LOGS);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error loading logs:', e);
      return [];
    }
  }

  logIncident(entry) {
    const logs = this.getLogs();
    const newEntry = {
      id: 'SOS-' + Date.now().toString(36).toUpperCase(),
      timestamp: new Date().toISOString(),
      displayTime: new Date().toLocaleTimeString(),
      type: entry.type,
      location: entry.location || null,
      actions: entry.actions || [],
      testMode: !!entry.testMode,
    };
    logs.unshift(newEntry);
    // Keep last 50 logs
    if (logs.length > 50) logs.pop();
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
    return newEntry;
  }

  clearLogs() {
    localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify([]));
  }
}

window.storageService = new StorageService();
