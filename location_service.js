/**
 * SOS Guardian - Location Service
 * Handles GPS coordinate retrieval, permission checks, map link generation,
 * and guaranteed fast timeout handling so emergency alerts are never delayed.
 */

class LocationService {
  constructor() {
    this.lastKnownLocation = null;
    this.permissionState = 'prompt'; // 'granted', 'denied', 'prompt'
    this.checkPermission();
  }

  async checkPermission() {
    if (navigator.permissions && navigator.permissions.query) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        this.permissionState = result.state;
        result.onchange = () => {
          this.permissionState = result.state;
          window.dispatchEvent(new CustomEvent('sos:permission_changed', { detail: { location: this.permissionState } }));
        };
      } catch (e) {
        console.warn('Geolocation permission query not supported:', e);
      }
    }
    return this.permissionState;
  }

  /**
   * Fast location fetch with strict timeout fallback.
   * Emergency alert dispatch MUST NEVER hang waiting on GPS.
   * @param {number} timeoutMs - Max milliseconds to wait (default 5000ms)
   * @returns {Promise<Object>} Location result object
   */
  async getCurrentLocation(timeoutMs = 5000) {
    return new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        return resolve({
          available: false,
          error: 'Geolocation is not supported by this device / browser',
          mapUrl: null,
          formattedText: 'GPS Location: Unavailable (Device unsupported)',
        });
      }

      let hasResolved = false;

      // Timeout fallback: never hold up emergency actions
      const timer = setTimeout(() => {
        if (!hasResolved) {
          hasResolved = true;
          console.warn('GPS location retrieval timed out after', timeoutMs, 'ms. Using fallback.');
          if (this.lastKnownLocation) {
            resolve({
              ...this.lastKnownLocation,
              isCached: true,
              warning: 'GPS timed out - using last cached location',
            });
          } else {
            resolve({
              available: false,
              error: `GPS timed out after ${timeoutMs / 1000}s`,
              mapUrl: null,
              formattedText: 'GPS Location: Unavailable (Timed out)',
            });
          }
        }
      }, timeoutMs);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (hasResolved) return;
          hasResolved = true;
          clearTimeout(timer);

          const { latitude, longitude, accuracy } = position.coords;
          const mapUrl = `https://maps.google.com/?q=${latitude.toFixed(6)},${longitude.toFixed(6)}`;
          const result = {
            available: true,
            latitude: latitude.toFixed(6),
            longitude: longitude.toFixed(6),
            accuracy: Math.round(accuracy),
            mapUrl: mapUrl,
            timestamp: new Date(position.timestamp).toISOString(),
            formattedText: `Location: ${latitude.toFixed(6)}, ${longitude.toFixed(6)} (Acc: ±${Math.round(accuracy)}m)\nMap Link: ${mapUrl}`,
          };

          this.lastKnownLocation = result;
          this.permissionState = 'granted';
          resolve(result);
        },
        (error) => {
          if (hasResolved) return;
          hasResolved = true;
          clearTimeout(timer);

          let msg = 'Location request failed';
          switch (error.code) {
            case error.PERMISSION_DENIED:
              msg = 'Location permission denied by user';
              this.permissionState = 'denied';
              break;
            case error.POSITION_UNAVAILABLE:
              msg = 'Location information unavailable';
              break;
            case error.TIMEOUT:
              msg = 'Location acquisition timed out';
              break;
          }

          if (this.lastKnownLocation) {
            resolve({
              ...this.lastKnownLocation,
              isCached: true,
              warning: `${msg} - Using last known coordinates`,
            });
          } else {
            resolve({
              available: false,
              error: msg,
              mapUrl: null,
              formattedText: 'GPS Location: Unavailable (' + msg + ')',
            });
          }
        },
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 10000,
        }
      );
    });
  }
}

window.locationService = new LocationService();
