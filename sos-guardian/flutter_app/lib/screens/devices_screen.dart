import 'dart:async';

import 'package:android_intent_plus/android_intent.dart';
import 'package:device_info_plus/device_info_plus.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_blue_plus/flutter_blue_plus.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:wifi_scan/wifi_scan.dart';

class DevicesScreen extends StatefulWidget {
  const DevicesScreen({Key? key}) : super(key: key);

  @override
  State<DevicesScreen> createState() => _DevicesScreenState();
}

class _DevicesScreenState extends State<DevicesScreen> {
  final List<ScanResult> _bleResults = [];
  List<WiFiAccessPoint> _wifiResults = [];
  StreamSubscription<List<ScanResult>>? _bleResultsSubscription;
  StreamSubscription<bool>? _scanningSubscription;
  bool _isScanning = false;
  bool _isScanningWifi = false;
  String? _wifiMessage;

  bool get _supportsBle => defaultTargetPlatform != TargetPlatform.windows;
  bool get _supportsWifi => defaultTargetPlatform == TargetPlatform.android;

  Future<int> _androidSdkInt() async {
    final androidInfo = await DeviceInfoPlugin().androidInfo;
    return androidInfo.version.sdkInt;
  }

  @override
  void initState() {
    super.initState();
    if (_supportsBle) {
      _bleResultsSubscription = FlutterBluePlus.scanResults.listen(
        (results) {
          if (!mounted) return;
          setState(() {
            _bleResults
              ..clear()
              ..addAll(results);
          });
        },
        onError: (Object error) => _showMessage('Bluetooth scan failed: $error'),
      );
      _scanningSubscription = FlutterBluePlus.isScanning.listen(
        (scanning) {
          if (mounted) setState(() => _isScanning = scanning);
        },
        onError: (Object error) => _showMessage('Bluetooth status unavailable: $error'),
      );
    }
  }

  Future<bool> _requestBluetoothPermissions() async {
    if (defaultTargetPlatform != TargetPlatform.android) return true;

    final permissions = <Permission>[
      Permission.bluetoothScan,
      Permission.bluetoothConnect,
    ];
    if (await _androidSdkInt() <= 30) {
      permissions.add(Permission.locationWhenInUse);
    }

    final statuses = await permissions.request();
    final denied = statuses.entries.where((entry) => !entry.value.isGranted);
    if (denied.isNotEmpty) {
      _showMessage(
        'Allow Nearby devices and, on Android 11 or older, Location to scan Bluetooth devices.',
      );
      return false;
    }
    return true;
  }

  Future<void> _startBleScan() async {
    try {
      if (!await _requestBluetoothPermissions()) return;
      setState(() => _bleResults.clear());
      await FlutterBluePlus.startScan(timeout: const Duration(seconds: 10));
    } catch (error) {
      _showMessage('Bluetooth scan failed: $error');
    }
  }

  Future<void> _scanWifiNetworks() async {
    if (!_supportsWifi) return;
    setState(() {
      _isScanningWifi = true;
      _wifiMessage = null;
      _wifiResults = [];
    });

    try {
      if (await _androidSdkInt() >= 33) {
        final nearbyStatus = await Permission.nearbyWifiDevices.request();
        if (!nearbyStatus.isGranted) {
          throw Exception('Nearby Wi-Fi devices permission was not granted.');
        }
      }
      final canStart = await WiFiScan.instance.canStartScan(askPermissions: true);
      if (canStart != CanStartScan.yes) {
        throw Exception(
          'Wi-Fi scanning is unavailable ($canStart). Check that Wi-Fi and Location are enabled.',
        );
      }

      final started = await WiFiScan.instance.startScan();
      if (!started) {
        throw Exception('Android did not start a Wi-Fi scan. Try again shortly.');
      }

      final results = await WiFiScan.instance.getScannedResults();
      if (!mounted) return;
      setState(() {
        _wifiResults = results;
        _wifiMessage = results.isEmpty
            ? 'No nearby networks returned. Android may limit scan frequency; try again later.'
            : null;
      });
    } catch (error) {
      if (mounted) setState(() => _wifiMessage = error.toString());
    } finally {
      if (mounted) setState(() => _isScanningWifi = false);
    }
  }

  Future<void> _openAndroidSettings(String action, String label) async {
    try {
      await AndroidIntent(action: action).launch();
    } catch (error) {
      _showMessage('Could not open $label settings: $error');
    }
  }

  Future<void> _toggleBleConnection(BluetoothDevice device) async {
    try {
      if (!await _requestBluetoothPermissions()) return;
      if (device.isConnected) {
        await device.disconnect();
      } else {
        await device.connect();
      }
      if (mounted) setState(() {});
    } catch (error) {
      _showMessage('Could not connect to ${device.platformName}: $error');
    }
  }

  void _showMessage(String message) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  @override
  void dispose() {
    _bleResultsSubscription?.cancel();
    _scanningSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Nearby Devices & Networks'),
        actions: [
          if (_supportsBle)
            IconButton(
              tooltip: _isScanning ? 'Stop Bluetooth scan' : 'Scan Bluetooth',
              icon: Icon(_isScanning ? Icons.stop : Icons.bluetooth_searching),
              onPressed: () {
                if (_isScanning) {
                  FlutterBluePlus.stopScan();
                } else {
                  _startBleScan();
                }
              },
            ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _buildBluetoothSection(),
          if (_supportsWifi) ...[
            const SizedBox(height: 28),
            _buildWifiSection(),
          ],
        ],
      ),
    );
  }

  Widget _buildBluetoothSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'BLUETOOTH DEVICES',
          style: TextStyle(color: Colors.white60, fontSize: 11, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        const Text(
          'Scan for Bluetooth Low Energy (BLE) devices such as compatible smartwatches and wearables. Classic audio devices, including most headphones and earbuds, must be paired in Android Bluetooth settings.',
          style: TextStyle(color: Colors.white70, fontSize: 13),
        ),
        if (_supportsBle && defaultTargetPlatform == TargetPlatform.android) ...[
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: () => _openAndroidSettings(
              'android.settings.BLUETOOTH_SETTINGS',
              'Bluetooth',
            ),
            icon: const Icon(Icons.headphones),
            label: const Text('Pair headphones or earbuds in Settings'),
          ),
        ],
        const SizedBox(height: 12),
        if (!_supportsBle)
          _buildInfoCard('Bluetooth scanning is not available on this platform.')
        else if (_bleResults.isEmpty)
          _buildInfoCard(
            _isScanning ? 'Scanning for nearby BLE devices...' : 'No BLE devices found yet. Start a scan to discover nearby devices.',
          )
        else
          ..._bleResults.map(_buildBleDeviceCard),
      ],
    );
  }

  Widget _buildBleDeviceCard(ScanResult result) {
    final device = result.device;
    final name = device.platformName.isNotEmpty ? device.platformName : 'Unnamed BLE device';
    final connected = device.isConnected;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white10),
      ),
      child: Row(
        children: [
          const Icon(Icons.bluetooth, color: Colors.blueAccent),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                Text(
                  'Signal: ${result.rssi} dBm',
                  style: const TextStyle(color: Colors.white54, fontSize: 11),
                ),
              ],
            ),
          ),
          TextButton(
            onPressed: () => _toggleBleConnection(device),
            child: Text(connected ? 'Disconnect' : 'Connect'),
          ),
        ],
      ),
    );
  }

  Widget _buildWifiSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text(
          'NEARBY WI-FI & HOTSPOTS',
          style: TextStyle(color: Colors.white60, fontSize: 11, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 8),
        const Text(
          'Scan on demand for nearby Wi-Fi networks. Android requires Location and Nearby Wi-Fi permissions. To join a network or hotspot, continue in Android Settings and confirm the connection there.',
          style: TextStyle(color: Colors.white70, fontSize: 13),
        ),
        const SizedBox(height: 12),
        Row(
          children: [
            Expanded(
              child: ElevatedButton.icon(
                style: ElevatedButton.styleFrom(
                  backgroundColor: const Color(0xFF2563EB),
                  padding: const EdgeInsets.symmetric(vertical: 13),
                ),
                onPressed: _isScanningWifi ? null : _scanWifiNetworks,
                icon: _isScanningWifi
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.wifi_find),
                label: Text(_isScanningWifi ? 'Scanning...' : 'Scan Wi-Fi'),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => _openAndroidSettings(
                  'android.settings.WIFI_SETTINGS',
                  'Wi-Fi',
                ),
                icon: const Icon(Icons.settings),
                label: const Text('Connect'),
              ),
            ),
          ],
        ),
        if (_wifiMessage != null) ...[
          const SizedBox(height: 10),
          _buildInfoCard(_wifiMessage!),
        ],
        if (_wifiResults.isNotEmpty) ...[
          const SizedBox(height: 14),
          ..._wifiResults.map(_buildWifiNetworkCard),
        ],
      ],
    );
  }

  Widget _buildWifiNetworkCard(WiFiAccessPoint network) {
    final name = network.ssid.isEmpty ? 'Hidden network' : network.ssid;
    final isSecured = RegExp(
      r'WEP|WPA|EAP|SAE|PSK|OWE',
      caseSensitive: false,
    ).hasMatch(network.capabilities);
    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: Colors.white10),
      ),
      child: Row(
        children: [
          Icon(isSecured ? Icons.wifi_lock : Icons.wifi, color: Colors.lightBlueAccent),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                Text(
                  '${isSecured ? 'Secured' : 'Open'} · Signal: ${network.level} dBm',
                  style: const TextStyle(color: Colors.white54, fontSize: 11),
                ),
              ],
            ),
          ),
          const Icon(Icons.wifi, color: Colors.white70),
        ],
      ),
    );
  }

  Widget _buildInfoCard(String message) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(20),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Text(
        message,
        textAlign: TextAlign.center,
        style: const TextStyle(color: Colors.white54),
      ),
    );
  }
}
