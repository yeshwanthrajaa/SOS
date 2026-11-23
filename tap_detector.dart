import 'dart:async';
import '../models/emergency_type.dart';

typedef TapProgressCallback = void Function(int currentTaps, EmergencyType predicted);
typedef EmergencyTriggerCallback = void Function(EmergencyType emergency);

/// Dedicated tap-sequence recognition state machine.
/// Distinguishes 1x (Crime), 2x (Medical), and 3x (Fire) taps cleanly
/// within a configurable detection window (700-1000ms).
class TapDetectorEngine {
  final int windowDurationMs;
  final TapProgressCallback onTapProgress;
  final EmergencyTriggerCallback onEmergencyTriggered;
  final VoidCallback onReset;

  int _tapCount = 0;
  Timer? _timer;
  bool _isLocked = false;

  TapDetectorEngine({
    this.windowDurationMs = 850,
    required this.onTapProgress,
    required this.onEmergencyTriggered,
    required this.onReset,
  });

  bool get isLocked => _isLocked;

  void lock() {
    _isLocked = true;
    _timer?.cancel();
  }

  void unlock() {
    _isLocked = false;
    reset();
  }

  void registerTap() {
    if (_isLocked) return;

    _tapCount += 1;
    final predicted = EmergencyType.fromTapCount(_tapCount);
    onTapProgress(_tapCount, predicted);

    // If 3rd tap reached, finalize after small debounce
    if (_tapCount >= 3) {
      _tapCount = 3;
      _timer?.cancel();
      _timer = Timer(const Duration(milliseconds: 250), _finalize);
      return;
    }

    _timer?.cancel();
    _timer = Timer(Duration(milliseconds: windowDurationMs), _finalize);
  }

  void _finalize() {
    final finalCount = _tapCount;
    reset();

    if (finalCount > 0) {
      final emergency = EmergencyType.fromTapCount(finalCount);
      onEmergencyTriggered(emergency);
    }
  }

  void reset() {
    _timer?.cancel();
    _timer = null;
    _tapCount = 0;
    onReset();
  }

  void dispose() {
    _timer?.cancel();
  }
}
