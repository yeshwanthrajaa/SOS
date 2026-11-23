import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/emergency_type.dart';
import '../services/tap_detector.dart';
import '../services/location_service.dart';
import '../services/alert_dispatcher.dart';
import 'settings_screen.dart';
import 'devices_screen.dart';

class HomeScreen extends StatefulWidget {
  const HomeScreen({Key? key}) : super(key: key);

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> with SingleTickerProviderStateMixin {
  late AnimationController _pulseController;
  late TapDetectorEngine _tapDetector;
  final EmergencyLocationService _locationService = EmergencyLocationService();
  final AlertDispatcher _alertDispatcher = AlertDispatcher();

  int _currentTapCount = 0;
  String _tapFeedbackText = 'Ready (Tap 1x, 2x, or 3x)';
  String _contactName = 'Emergency Contact';
  String _contactPhone = '+15551234567';
  bool _testMode = false;
  int _countdownSeconds = 4;

  @override
  void initState() {
    super.initState();
    _pulseController = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 2),
    )..repeat(reverse: true);

    _tapDetector = TapDetectorEngine(
      windowDurationMs: 850,
      onTapProgress: (count, predicted) {
        setState(() {
          _currentTapCount = count;
          _tapFeedbackText = 'Tap $count/3: ${predicted.title}';
        });
      },
      onReset: () {
        setState(() {
          _currentTapCount = 0;
          _tapFeedbackText = 'Ready (Tap 1x, 2x, or 3x)';
        });
      },
      onEmergencyTriggered: (emergency) {
        _triggerEmergencySequence(emergency);
      },
    );

    _loadPreferences();
  }

  Future<void> _loadPreferences() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _contactName = prefs.getString('contact_name') ?? 'Primary Contact';
      _contactPhone = prefs.getString('contact_phone') ?? '+15551234567';
      _testMode = prefs.getBool('test_mode') ?? false;
      _countdownSeconds = prefs.getInt('countdown_seconds') ?? 4;
    });
  }

  void _triggerEmergencySequence(EmergencyType emergency) {
    if (_countdownSeconds > 0) {
      _showCountdownDialog(emergency);
    } else {
      _executeDispatch(emergency);
    }
  }

  void _showCountdownDialog(EmergencyType emergency) {
    int remaining = _countdownSeconds;
    Timer? countdownTimer;

    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (context, setDialogState) {
            countdownTimer ??= Timer.periodic(const Duration(seconds: 1), (timer) {
              if (remaining > 1) {
                setDialogState(() => remaining--);
              } else {
                timer.cancel();
                Navigator.of(ctx).pop();
                _executeDispatch(emergency);
              }
            });

            return AlertDialog(
              backgroundColor: const Color(0xFF0F172A),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
              title: Column(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                    decoration: BoxDecoration(
                      color: emergency.themeColor.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: emergency.themeColor),
                    ),
                    child: Text(
                      emergency.title.toUpperCase(),
                      style: TextStyle(color: emergency.themeColor, fontSize: 13, fontWeight: FontWeight.bold),
                    ),
                  ),
                  const SizedBox(height: 12),
                  const Text('Initiating SOS Alert', style: TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                ],
              ),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Container(
                    width: 110,
                    height: 110,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      border: Border.all(color: emergency.themeColor, width: 4),
                    ),
                    alignment: Alignment.center,
                    child: Text(
                      '$remaining',
                      style: const TextStyle(fontSize: 48, fontWeight: FontWeight.w900, color: Colors.white),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'Alerting emergency contacts via SMS, WhatsApp, and phone call.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: Colors.white70, fontSize: 12),
                  ),
                ],
              ),
              actions: [
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    onPressed: () {
                      countdownTimer?.cancel();
                      Navigator.of(ctx).pop();
                      _tapDetector.unlock();
                    },
                    child: const Text('CANCEL / FALSE ALARM', style: TextStyle(fontWeight: FontWeight.w900)),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }

  Future<void> _executeDispatch(EmergencyType emergency) async {
    _tapDetector.lock();

    // Show Progress Dialog
    showModalBottomSheet(
      context: context,
      isDismissible: true,
      backgroundColor: const Color(0xFF1E293B),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24)),
      ),
      builder: (ctx) {
        return FutureBuilder<LocationResult>(
          future: _locationService.getCurrentLocation(timeoutSeconds: 4),
          builder: (context, locSnapshot) {
            if (locSnapshot.connectionState == ConnectionState.waiting) {
              return const Padding(
                padding: EdgeInsets.all(32),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(color: Colors.red),
                    SizedBox(height: 16),
                    Text('Acquiring GPS location...', style: TextStyle(color: Colors.white)),
                  ],
                ),
              );
            }

            final location = locSnapshot.data ?? LocationResult(available: false, error: 'Location unavailable');

            return FutureBuilder<List<DispatchStep>>(
              future: _alertDispatcher.dispatchEmergencyAlert(
                emergency: emergency,
                targetPhone: _contactPhone,
                location: location,
                testMode: _testMode,
              ),
              builder: (context, dispatchSnapshot) {
                final steps = dispatchSnapshot.data ?? [];
                return Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${emergency.title} Report', style: const TextStyle(color: Colors.white, fontSize: 18, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 12),
                      ...steps.map((s) => ListTile(
                            dense: true,
                            contentPadding: EdgeInsets.zero,
                            title: Text(s.title, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.bold)),
                            subtitle: Text(s.details, style: const TextStyle(color: Colors.white70, fontSize: 12)),
                            trailing: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: s.status == 'LAUNCHED' ? Colors.blue.withOpacity(0.2) : Colors.green.withOpacity(0.2),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(s.status, style: const TextStyle(color: Colors.white, fontSize: 10)),
                            ),
                          )),
                      const SizedBox(height: 12),
                      SizedBox(
                        width: double.infinity,
                        child: ElevatedButton(
                          onPressed: () {
                            Navigator.pop(ctx);
                            _tapDetector.unlock();
                          },
                          child: const Text('Close Report'),
                        ),
                      ),
                    ],
                  ),
                );
              },
            );
          },
        );
      },
    );
  }

  @override
  void dispose() {
    _pulseController.dispose();
    _tapDetector.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Row(
          children: [
            Icon(Icons.shield, color: Color(0xFFEF4444)),
            SizedBox(width: 8),
            Text('SOS Guardian', style: TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.bluetooth),
            onPressed: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const DevicesScreen())),
          ),
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () async {
              await Navigator.push(context, MaterialPageRoute(builder: (_) => const SettingsScreen()));
              _loadPreferences();
            },
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            if (_testMode)
              Container(
                width: double.infinity,
                color: Colors.amber[700],
                padding: const EdgeInsets.symmetric(vertical: 4),
                child: const Text(
                  '⚠️ TEST MODE ACTIVE (SIMULATION)',
                  textAlign: TextAlign.center,
                  style: TextStyle(color: Colors.black, fontSize: 11, fontWeight: FontWeight.bold),
                ),
              ),
            // Status bar
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 8),
              child: Row(
                children: [
                  Expanded(
                    child: _buildStatusCard('GPS', Icons.location_on, 'Active'),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildStatusCard('Contact', Icons.person, _contactName),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: _buildStatusCard('Gadgets', Icons.bluetooth, 'Ready'),
                  ),
                ],
              ),
            ),
            const Spacer(),
            // Tap indicator badge
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF1E293B),
                borderRadius: BorderRadius.circular(20),
                border: Border.all(color: Colors.white12),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  ...List.generate(3, (idx) {
                    final active = idx < _currentTapCount;
                    return Container(
                      margin: const EdgeInsets.symmetric(horizontal: 3),
                      width: 8,
                      height: 8,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: active ? const Color(0xFFEF4444) : Colors.white24,
                      ),
                    );
                  }),
                  const SizedBox(width: 8),
                  Text(_tapFeedbackText, style: const TextStyle(color: Colors.white, fontSize: 12, fontWeight: FontWeight.bold)),
                ],
              ),
            ),
            const SizedBox(height: 24),
            // Big Circular SOS Button
            GestureDetector(
              onTap: () => _tapDetector.registerTap(),
              child: AnimatedBuilder(
                animation: _pulseController,
                builder: (context, child) {
                  return Container(
                    width: 220,
                    height: 220,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: const RadialGradient(
                        colors: [Color(0xFFEF4444), Color(0xFF991B1B)],
                      ),
                      border: Border.all(color: const Color(0xFFFCA5A5), width: 5),
                      boxShadow: [
                        BoxShadow(
                          color: const Color(0xFFEF4444).withOpacity(0.4 + (_pulseController.value * 0.25)),
                          blurRadius: 30 + (_pulseController.value * 25),
                          spreadRadius: 2 + (_pulseController.value * 8),
                        ),
                      ],
                    ),
                    alignment: Alignment.center,
                    child: const Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('SOS', style: TextStyle(color: Colors.white, fontSize: 52, fontWeight: FontWeight.w900)),
                        Text('TAP TO ALERT', style: TextStyle(color: Colors.white70, fontSize: 10, letterSpacing: 1.5, fontWeight: FontWeight.bold)),
                      ],
                    ),
                  );
                },
              ),
            ),
            const Spacer(),
            // Guide instructions
            Padding(
              padding: const EdgeInsets.all(20),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: const Color(0xFF1E293B),
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: Colors.white10),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('EMERGENCY TAP RECOGNITION GUIDE', style: TextStyle(color: Colors.white54, fontSize: 11, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: _buildLegendItem('1x Tap', 'Crime', const Color(0xFFEF4444))),
                        Expanded(child: _buildLegendItem('2x Taps', 'Medical', const Color(0xFF2563EB))),
                        Expanded(child: _buildLegendItem('3x Taps', 'Fire', const Color(0xFFEA580C))),
                      ],
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildStatusCard(String title, IconData icon, String val) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
      decoration: BoxDecoration(
        color: const Color(0xFF1E293B),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white10),
      ),
      child: Column(
        children: [
          Icon(icon, color: Colors.white70, size: 16),
          const SizedBox(height: 4),
          Text(title, style: const TextStyle(color: Colors.white54, fontSize: 10)),
          Text(val, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }

  Widget _buildLegendItem(String tap, String type, Color color) {
    return Column(
      children: [
        Text(tap, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 13)),
        const SizedBox(height: 2),
        Text(type, style: const TextStyle(color: Colors.white70, fontSize: 11)),
      ],
    );
  }
}
