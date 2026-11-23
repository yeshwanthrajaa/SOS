/**
 * SOS Guardian - Nearby Devices & BLE Gadget Discovery Service
 * Discovers compatible Bluetooth Low Energy (BLE) gadgets (smartwatches, panic buttons, fobs)
 * using the Web Bluetooth API with battery service reading and simulated emergency hardware.
 */

class BluetoothService {
  constructor() {
    this.devices = new Map();
    this.isScanning = false;
    this.isSupported = 'bluetooth' in navigator;
    this._initDemoGadgets();
  }

  _initDemoGadgets() {
    // Known compatible emergency devices (registered profiles)
    const demoDevices = [
      {
        id: 'gadget-flic-sos',
        name: 'Guardian BLE Panic Button',
        type: 'sos_button',
        status: 'connected',
        batteryLevel: 94,
        rssi: -58,
        description: 'Dedicated wearable single/double-click emergency fob',
        lastSeen: 'Just now',
        compatible: true,
      },
      {
        id: 'gadget-watch-pro',
        name: 'SmartWatch SOS Companion',
        type: 'smartwatch',
        status: 'available',
        batteryLevel: 78,
        rssi: -72,
        description: 'WearOS / Tizen BLE emergency trigger bridge',
        lastSeen: '1 min ago',
        compatible: true,
      },
      {
        id: 'gadget-beacon-01',
        name: 'Medical Beacon Pendant (iBeacon)',
        type: 'beacon',
        status: 'available',
        batteryLevel: 45,
        rssi: -84,
        description: 'Continuous health monitoring & fall detection transmitter',
        lastSeen: '3 mins ago',
        compatible: true,
      },
      {
        id: 'gadget-unsupported',
        name: 'Generic Audio Headset',
        type: 'audio',
        status: 'incompatible',
        batteryLevel: null,
        rssi: -90,
        description: 'Incompatible device: Does not support emergency GATT triggers',
        lastSeen: '5 mins ago',
        compatible: false,
      },
    ];

    demoDevices.forEach((dev) => this.devices.set(dev.id, dev));
  }

  getDeviceList() {
    return Array.from(this.devices.values());
  }

  /**
   * Request real Bluetooth Low Energy device using Web Bluetooth API
   */
  async scanForRealDevice() {
    if (!this.isSupported) {
      throw new Error(
        'Web Bluetooth is not available in this browser. Please use Chrome, Edge, or an Android WebBluetooth browser over HTTPS/localhost.'
      );
    }

    try {
      this.isScanning = true;
      window.dispatchEvent(new CustomEvent('sos:ble_scan_start'));

      // Scan with optional services: battery_service (0x180F), heart_rate (0x180D)
      const device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['battery_service', 0x180f, 0x1802],
      });

      let batteryLevel = null;
      let status = 'available';

      // Connect to GATT server to inspect services
      if (device.gatt) {
        try {
          const server = await device.gatt.connect();
          status = 'connected';

          // Try reading battery level characteristic
          try {
            const batteryService = await server.getPrimaryService('battery_service');
            const batteryChar = await batteryService.getCharacteristic('battery_level');
            const val = await batteryChar.readValue();
            batteryLevel = val.getUint8(0);
          } catch (e) {
            console.log('Battery service not exposed by device:', e);
          }

          // Handle unexpected disconnection
          device.addEventListener('gattserverdisconnected', () => {
            const current = this.devices.get(device.id);
            if (current) {
              current.status = 'disconnected';
              window.dispatchEvent(new CustomEvent('sos:devices_updated'));
            }
          });
        } catch (e) {
          console.warn('GATT connection failed or cancelled:', e);
          status = 'available';
        }
      }

      const newDevice = {
        id: device.id,
        name: device.name || 'Unnamed BLE Device',
        type: 'ble_custom',
        status: status,
        batteryLevel: batteryLevel,
        rssi: -65,
        description: 'Discovered via Web Bluetooth API',
        lastSeen: 'Just now',
        compatible: true,
        nativeDevice: device,
      };

      this.devices.set(newDevice.id, newDevice);
      window.dispatchEvent(new CustomEvent('sos:devices_updated'));
      return newDevice;
    } catch (err) {
      if (err.name === 'NotFoundError') {
        // User cancelled picker
        return null;
      }
      throw err;
    } finally {
      this.isScanning = false;
      window.dispatchEvent(new CustomEvent('sos:ble_scan_end'));
    }
  }

  /**
   * Connect or disconnect a specific gadget
   */
  async toggleConnection(deviceId) {
    const dev = this.devices.get(deviceId);
    if (!dev) return false;

    if (!dev.compatible) {
      alert(`Notice: "${dev.name}" cannot be connected as an emergency trigger because it lacks standard emergency GATT protocol characteristics.`);
      return false;
    }

    if (dev.status === 'connected') {
      if (dev.nativeDevice && dev.nativeDevice.gatt && dev.nativeDevice.gatt.connected) {
        dev.nativeDevice.gatt.disconnect();
      }
      dev.status = 'available';
    } else {
      if (dev.nativeDevice && dev.nativeDevice.gatt) {
        try {
          await dev.nativeDevice.gatt.connect();
        } catch (e) {
          console.warn('Connection failed:', e);
        }
      }
      dev.status = 'connected';
    }

    window.dispatchEvent(new CustomEvent('sos:devices_updated'));
    return dev.status === 'connected';
  }

  /**
   * Simulate a remote hardware trigger pressed on a connected gadget
   */
  simulateHardwareTrigger(deviceId, tapCount = 1) {
    const dev = this.devices.get(deviceId);
    if (!dev) return;

    if (dev.status !== 'connected') {
      alert(`Cannot trigger emergency: "${dev.name}" is not currently connected.`);
      return;
    }

    console.log(`[BLE Hardware Trigger] Signal received from ${dev.name}: ${tapCount} clicks`);
    window.dispatchEvent(
      new CustomEvent('sos:hardware_trigger', {
        detail: {
          device: dev,
          tapCount: tapCount,
        },
      })
    );
  }

  getConnectedCount() {
    let count = 0;
    this.devices.forEach((d) => {
      if (d.status === 'connected') count++;
    });
    return count;
  }
}

window.bluetoothService = new BluetoothService();
