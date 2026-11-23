/**
 * SOS Guardian - Storage Service
 * Handles persistence for emergency contacts, preferences, and emergency incident logs.
 */

const STORAGE_KEYS = {
  CONTACT: 'sos_guardian_contact',
  CONTACTS: 'sos_guardian_contacts',
  SETTINGS: 'sos_guardian_settings',
  LOGS: 'sos_guardian_logs',
};

const DEFAULT_SETTINGS = {
  tapWindowMs: 850,          // 700 - 1000 ms detection window
  countdownSeconds: 4,      // Cancellation countdown (0 to disable)
  testMode: false,          // Test mode: dispatches to safe preview instead of real carrier
  audioAlert: true,         // Play audio tone during countdown
  autoDialDelay: 1000,      // Delay between WhatsApp and phone dialer
  locationTrackingEnabled: false,
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
    if (!localStorage.getItem(STORAGE_KEYS.CONTACTS)) {
      let existingContact = null;
      try {
        const legacyContact = localStorage.getItem(STORAGE_KEYS.CONTACT);
        existingContact = legacyContact ? JSON.parse(legacyContact) : null;
      } catch (e) {
        console.error('Error migrating emergency contact:', e);
      }
      const isPlaceholder = existingContact
        && existingContact.name === DEFAULT_CONTACT.name
        && existingContact.phone === DEFAULT_CONTACT.phone;
      localStorage.setItem(
        STORAGE_KEYS.CONTACTS,
        JSON.stringify(existingContact && existingContact.phone && !isPlaceholder ? [existingContact] : [])
      );
    }
    if (!localStorage.getItem(STORAGE_KEYS.LOGS)) {
      localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify([]));
    }
    localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(this.getContacts()));
  }

  _normalizeContact(contact) {
    if (contact.countryCode && contact.nationalNumber) {
      const callingCode = `+${String(contact.countryCode).replace(/\D/g, '')}`;
      const nationalNumber = String(contact.nationalNumber).replace(/\D/g, '');
      return {
        ...contact,
        countryCode: callingCode,
        nationalNumber,
        phone: `${callingCode}${nationalNumber}`,
      };
    }

    const phone = String(contact.phone || '').replace(/[^\d+]/g, '');
    const country = (window.SOS_COUNTRY_CODES || [])
      .slice()
      .sort((a, b) => b.dialCode.length - a.dialCode.length)
      .find((item) => phone.startsWith(item.dialCode));
    if (!country) {
      return { ...contact, phone, countryCode: '', nationalNumber: phone.replace(/\D/g, '') };
    }

    const nationalNumber = phone.slice(country.dialCode.length).replace(/\D/g, '');
    return {
      ...contact,
      countryCode: country.dialCode,
      countryIso: country.iso,
      nationalNumber,
      phone: `${country.dialCode}${nationalNumber}`,
    };
  }

  // Contact Operations
  getContacts() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CONTACTS);
      const contacts = data ? JSON.parse(data) : [];
      return Array.isArray(contacts)
        ? contacts
          .filter((contact) => contact && contact.phone)
          .map((contact) => this._normalizeContact(contact))
          .filter((contact) => !(contact.name === DEFAULT_CONTACT.name && contact.phone === DEFAULT_CONTACT.phone))
        : [];
    } catch (e) {
      console.error('Error loading emergency contacts:', e);
      return [];
    }
  }

  getContact() {
    return this.getContacts()[0] || null;
  }

  addContact(contact) {
    if (!contact) throw new Error('Contact details are required');
    const normalized = contact.countryCode
      ? contact
      : this._normalizeContact(contact);
    const validation = this.validatePhoneNumber(normalized.countryCode, normalized.nationalNumber);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    const validatedContact = {
      name: (contact.name || 'Emergency Contact').trim(),
      phone: validation.formatted,
      countryCode: validation.countryCode,
      countryIso: contact.countryIso || '',
      nationalNumber: validation.nationalNumber,
      relationship: (contact.relationship || 'Emergency Contact').trim(),
      configured: true,
      updatedAt: new Date().toISOString(),
    };
    const contacts = this.getContacts();
    const existingIndex = contacts.findIndex((saved) => saved.phone === validatedContact.phone);
    if (existingIndex >= 0) {
      contacts[existingIndex] = validatedContact;
    } else {
      contacts.push(validatedContact);
    }
    localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
    return validatedContact;
  }

  moveContactToFirst(phone) {
    const contacts = this.getContacts();
    const index = contacts.findIndex((contact) => contact.phone === phone);
    if (index < 0) return false;
    if (index === 0) return true;
    contacts.unshift(contacts.splice(index, 1)[0]);
    localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(contacts));
    return true;
  }

  removeContact(phone) {
    const contacts = this.getContacts();
    const updatedContacts = contacts.filter((contact) => contact.phone !== phone);
    if (updatedContacts.length === contacts.length) return false;
    localStorage.setItem(STORAGE_KEYS.CONTACTS, JSON.stringify(updatedContacts));
    return true;
  }

  validatePhoneNumber(countryCode, nationalNumber) {
    if (nationalNumber === undefined) {
      const phone = String(countryCode || '').replace(/[\s\-()]/g, '');
      if (!/^\+[1-9]\d{6,14}$/.test(phone)) {
        return { valid: false, error: 'Choose a country code and enter the national number separately.' };
      }
      const normalized = this._normalizeContact({ phone });
      return {
        valid: true,
        formatted: phone,
        countryCode: normalized.countryCode,
        nationalNumber: normalized.nationalNumber,
      };
    }

    const callingCode = String(countryCode || '').replace(/\D/g, '');
    const number = String(nationalNumber || '').trim().replace(/[\s\-().]/g, '');
    const countryExists = (window.SOS_COUNTRY_CODES || [])
      .some((country) => country.dialCode === `+${callingCode}`);
    if (!countryExists) {
      return { valid: false, error: 'Select a valid country calling code.' };
    }
    if (!/^\d+$/.test(number)) {
      return { valid: false, error: 'Enter the national phone number using digits only.' };
    }
    if (callingCode.length + number.length < 7 || callingCode.length + number.length > 15) {
      return { valid: false, error: 'The full international number must contain 7 to 15 digits.' };
    }

    return {
      valid: true,
      formatted: `+${callingCode}${number}`,
      countryCode: `+${callingCode}`,
      nationalNumber: number,
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
