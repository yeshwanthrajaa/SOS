import 'dart:async';
import 'package:geolocator/geolocator.dart';

class LocationResult {
  final bool available;
  final double? latitude;
  final double? longitude;
  final double? accuracy;
  final String? mapUrl;
  final String? error;
  final bool isCached;

  LocationResult({
    required this.available,
    this.latitude,
    this.longitude,
    this.accuracy,
    this.mapUrl,
    this.error,
    this.isCached = false,
  });

  String get formattedText {
    if (available && latitude != null && longitude != null) {
      return 'My current location is: https://maps.google.com/?q=$latitude,$longitude (±${accuracy?.round() ?? 0}m)';
    }
    return 'Location unavailable at time of alert ($error)';
  }
}

class EmergencyLocationService {
  LocationResult? _lastKnownLocation;

  Future<bool> checkAndRequestPermissions() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) return false;

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) return false;
    }

    if (permission == LocationPermission.deniedForever) return false;

    return true;
  }

  /// Emergency location fetch with strict timeout fallback.
  /// An emergency alert must NEVER hang waiting for a GPS fix.
  Future<LocationResult> getCurrentLocation({int timeoutSeconds = 5}) async {
    try {
      final hasPermission = await checkAndRequestPermissions();
      if (!hasPermission) {
        return LocationResult(
          available: false,
          error: 'Location permission denied or services disabled',
        );
      }

      final position = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: timeoutSeconds),
      );

      final result = LocationResult(
        available: true,
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        mapUrl: 'https://maps.google.com/?q=${position.latitude},${position.longitude}',
      );
      _lastKnownLocation = result;
      return result;
    } on TimeoutException {
      if (_lastKnownLocation != null) {
        return LocationResult(
          available: true,
          latitude: _lastKnownLocation!.latitude,
          longitude: _lastKnownLocation!.longitude,
          accuracy: _lastKnownLocation!.accuracy,
          mapUrl: _lastKnownLocation!.mapUrl,
          isCached: true,
          error: 'Acquisition timed out; using cached fix',
        );
      }
      return LocationResult(
        available: false,
        error: 'GPS acquisition timed out after ${timeoutSeconds}s',
      );
    } catch (e) {
      return LocationResult(
        available: false,
        error: e.toString(),
      );
    }
  }
}
