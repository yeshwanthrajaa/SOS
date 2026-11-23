import 'dart:io';
import 'package:url_launcher/url_launcher.dart';
import '../models/emergency_type.dart';
import 'location_service.dart';

class DispatchStep {
  final String title;
  final String status;
  final String details;

  DispatchStep({required this.title, required this.status, required this.details});
}

class AlertDispatcher {
  /// Builds the complete payload
  String composePayload(EmergencyType emergency, LocationResult location) {
    final buffer = StringBuffer();
    buffer.writeln(emergency.baseMessage);
    buffer.writeln(location.formattedText);
    buffer.writeln('Time: ${DateTime.now().toLocal()}');
    buffer.write('[Sent via SOS Guardian Smart Alert]');
    return buffer.toString();
  }

  /// Executes SMS, WhatsApp, and Call sequentially
  Future<List<DispatchStep>> dispatchEmergencyAlert({
    required EmergencyType emergency,
    required String targetPhone,
    required LocationResult location,
    required bool testMode,
    Function(DispatchStep step)? onStepUpdate,
  }) async {
    final steps = <DispatchStep>[];
    final cleanPhone = targetPhone.replaceAll(RegExp(r'[^0-9+]'), '');
    final cleanDigitsOnly = cleanPhone.replaceAll(RegExp(r'[^0-9]'), '');
    final payload = composePayload(emergency, location);

    void recordStep(String title, String status, String details) {
      final step = DispatchStep(title: title, status: status, details: details);
      steps.add(step);
      onStepUpdate?.call(step);
    }

    // Step 1: Classification
    recordStep('1. Emergency Type', 'VERIFIED', '${emergency.title} (${emergency.tapInstruction}) identified.');

    // Step 2: Location
    recordStep(
      '2. GPS Location',
      location.available ? 'ACQUIRED' : 'FALLBACK',
      location.formattedText,
    );

    // Step 3: SMS Dispatch
    if (testMode) {
      recordStep('3. Emergency SMS', 'TEST_MODE', 'SMS simulated for $cleanPhone (real carrier sending suppressed).');
    } else {
      try {
        final Uri smsUri = Platform.isIOS
            ? Uri.parse('sms:$cleanPhone&body=${Uri.encodeComponent(payload)}')
            : Uri.parse('sms:$cleanPhone?body=${Uri.encodeComponent(payload)}');

        if (await canLaunchUrl(smsUri)) {
          await launchUrl(smsUri, mode: LaunchMode.externalApplication);
          recordStep('3. Emergency SMS', 'LAUNCHED', 'SMS messenger opened with payload. User confirmation required by OS.');
        } else {
          recordStep('3. Emergency SMS', 'ERROR', 'Could not open native SMS messenger.');
        }
      } catch (e) {
        recordStep('3. Emergency SMS', 'ERROR', e.toString());
      }
    }

    await Future.delayed(const Duration(milliseconds: 700));

    // Step 4: WhatsApp Deep Link
    if (testMode) {
      recordStep('4. WhatsApp Alert', 'TEST_MODE', 'WhatsApp simulated for $cleanDigitsOnly.');
    } else {
      try {
        final Uri waUri = Uri.parse('https://wa.me/$cleanDigitsOnly?text=${Uri.encodeComponent(payload)}');
        if (await canLaunchUrl(waUri)) {
          await launchUrl(waUri, mode: LaunchMode.externalApplication);
          recordStep('4. WhatsApp Alert', 'LAUNCHED', 'WhatsApp chat opened with prefilled emergency coordinates.');
        } else {
          recordStep('4. WhatsApp Alert', 'ERROR', 'WhatsApp application not installed or blocked by sandbox.');
        }
      } catch (e) {
        recordStep('4. WhatsApp Alert', 'ERROR', e.toString());
      }
    }

    await Future.delayed(const Duration(milliseconds: 900));

    // Step 5: Phone Call
    if (testMode) {
      recordStep('5. Phone Call', 'TEST_MODE', 'Phone call simulated for $cleanPhone.');
    } else {
      try {
        final Uri callUri = Uri.parse('tel:$cleanPhone');
        if (await canLaunchUrl(callUri)) {
          await launchUrl(callUri, mode: LaunchMode.externalApplication);
          recordStep('5. Phone Call', 'LAUNCHED', 'Native phone dialer launched. Confirmation required by OS.');
        } else {
          recordStep('5. Phone Call', 'ERROR', 'Dialer could not be launched.');
        }
      } catch (e) {
        recordStep('5. Phone Call', 'ERROR', e.toString());
      }
    }

    return steps;
  }
}
