import * as Location from 'expo-location';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const EMERGENCY_TYPES = {
  CRIME: {
    id: 'crime',
    label: 'Crime / Personal Safety',
    code: '1x Tap',
    color: '#EF4444',
    message: 'CRIME EMERGENCY! I am in immediate personal danger and need help urgently.',
  },
  MEDICAL: {
    id: 'medical',
    label: 'Medical Emergency',
    code: '2x Taps',
    color: '#2563EB',
    message: 'MEDICAL EMERGENCY! I need urgent medical assistance.',
  },
  FIRE: {
    id: 'fire',
    label: 'Fire Emergency',
    code: '3x Taps',
    color: '#EA580C',
    message: 'FIRE EMERGENCY! Fire assistance is needed urgently.',
  },
};

export class EmergencyEngine {
  static async getCurrentLocation(timeoutMs = 4500) {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return { available: false, error: 'Permission denied' };
      }

      // Fast location acquisition with promise race timeout
      const locPromise = Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('GPS timeout')), timeoutMs)
      );

      const loc = await Promise.race([locPromise, timeoutPromise]);
      const lat = loc.coords.latitude.toFixed(6);
      const lng = loc.coords.longitude.toFixed(6);
      const mapUrl = `https://maps.google.com/?q=${lat},${lng}`;

      return {
        available: true,
        latitude: lat,
        longitude: lng,
        accuracy: Math.round(loc.coords.accuracy || 0),
        mapUrl,
      };
    } catch (e) {
      return { available: false, error: e.message };
    }
  }

  static async dispatchAlert({ emergency, contact, isTestMode }) {
    const location = await this.getCurrentLocation();
    const cleanPhone = contact.phone.replace(/[^0-9+]/g, '');
    const cleanDigits = cleanPhone.replace(/[^0-9]/g, '');

    let body = `${emergency.message}\n`;
    if (location.available) {
      body += `My current location is: ${location.mapUrl}\n`;
    } else {
      body += `Location unavailable (${location.error})\n`;
    }
    body += `Time: ${new Date().toLocaleTimeString()}\n[Sent via SOS Guardian]`;

    const encoded = encodeURIComponent(body);

    if (isTestMode) {
      return { testMode: true, payload: body };
    }

    // 1. Launch SMS
    const smsUrl = Platform.OS === 'ios' ? `sms:${cleanPhone}&body=${encoded}` : `sms:${cleanPhone}?body=${encoded}`;
    await Linking.openURL(smsUrl).catch(console.warn);

    // 2. Open WhatsApp
    setTimeout(async () => {
      const waUrl = `whatsapp://send?phone=${cleanDigits}&text=${encoded}`;
      const waWeb = `https://wa.me/${cleanDigits}?text=${encoded}`;
      const canOpen = await Linking.canOpenURL(waUrl);
      if (canOpen) {
        await Linking.openURL(waUrl).catch(console.warn);
      } else {
        await Linking.openURL(waWeb).catch(console.warn);
      }
    }, 800);

    // 3. Launch Dialer
    setTimeout(async () => {
      await Linking.openURL(`tel:${cleanPhone}`).catch(console.warn);
    }, 1600);

    return { testMode: false, location, payload: body };
  }
}
