import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({Key? key}) : super(key: key);

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  final _nameController = TextEditingController();
  final _phoneController = TextEditingController();
  bool _testMode = false;
  int _countdownSeconds = 4;
  int _tapWindowMs = 850;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _nameController.text = prefs.getString('contact_name') ?? 'Primary Contact';
      _phoneController.text = prefs.getString('contact_phone') ?? '+15551234567';
      _testMode = prefs.getBool('test_mode') ?? false;
      _countdownSeconds = prefs.getInt('countdown_seconds') ?? 4;
      _tapWindowMs = prefs.getInt('tap_window_ms') ?? 850;
    });
  }

  Future<void> _save() async {
    final phone = _phoneController.text.trim();
    if (!phone.startsWith('+') && phone.length < 10) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please include country code starting with + (e.g. +1234567890)')),
      );
      return;
    }

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('contact_name', _nameController.text.trim());
    await prefs.setString('contact_phone', phone);
    await prefs.setBool('test_mode', _testMode);
    await prefs.setInt('countdown_seconds', _countdownSeconds);
    await prefs.setInt('tap_window_ms', _tapWindowMs);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Settings saved successfully!')),
      );
      Navigator.pop(context);
    }
  }

  void _testFeature(String scheme) async {
    final phone = _phoneController.text.trim();
    final uri = scheme == 'sms'
        ? Uri.parse('sms:$phone?body=SOS%20Guardian%20Diagnostic%20Test')
        : scheme == 'wa'
            ? Uri.parse('https://wa.me/${phone.replaceAll('+', '')}?text=SOS%20Guardian%20Diagnostic%20Test')
            : Uri.parse('tel:$phone');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0F172A),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: const Text('Emergency Settings'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          const Text('PRIMARY EMERGENCY CONTACT', style: TextStyle(color: Colors.redAccent, fontSize: 12, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          TextField(
            controller: _nameController,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'Contact Name',
              labelStyle: const TextStyle(color: Colors.white60),
              filled: true,
              fillColor: const Color(0xFF1E293B),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _phoneController,
            keyboardType: TextInputType.phone,
            style: const TextStyle(color: Colors.white),
            decoration: InputDecoration(
              labelText: 'Phone Number (with Country Code)',
              hintText: '+15551234567',
              labelStyle: const TextStyle(color: Colors.white60),
              hintStyle: const TextStyle(color: Colors.white24),
              filled: true,
              fillColor: const Color(0xFF1E293B),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(12)),
            ),
          ),
          const SizedBox(height: 20),
          const Text('SAFE FEATURE DIAGNOSTICS', style: TextStyle(color: Colors.white60, fontSize: 12, fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.sms, size: 16),
                  label: const Text('Test SMS'),
                  onPressed: () => _testFeature('sms'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.chat, size: 16),
                  label: const Text('Test WhatsApp'),
                  onPressed: () => _testFeature('wa'),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.phone, size: 16),
                  label: const Text('Test Call'),
                  onPressed: () => _testFeature('tel'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 24),
          const Text('DETECTION & SAFETY CONTROLS', style: TextStyle(color: Colors.white60, fontSize: 12, fontWeight: FontWeight.bold)),
          SwitchListTile(
            title: const Text('Test Mode (Simulation Only)', style: TextStyle(color: Colors.white)),
            subtitle: const Text('Prevents real carrier calls and SMS', style: TextStyle(color: Colors.white54, fontSize: 12)),
            value: _testMode,
            onChanged: (v) => setState(() => _testMode = v),
          ),
          ListTile(
            title: Text('Cancellation Countdown: $_countdownSeconds s', style: const TextStyle(color: Colors.white)),
            subtitle: Slider(
              min: 0,
              max: 10,
              divisions: 10,
              value: _countdownSeconds.toDouble(),
              onChanged: (v) => setState(() => _countdownSeconds = v.round()),
            ),
          ),
          ListTile(
            title: Text('Tap Detection Window: $_tapWindowMs ms', style: const TextStyle(color: Colors.white)),
            subtitle: Slider(
              min: 500,
              max: 1500,
              divisions: 10,
              value: _tapWindowMs.toDouble(),
              onChanged: (v) => setState(() => _tapWindowMs = v.round()),
            ),
          ),
          const SizedBox(height: 24),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: const Color(0xFF2563EB),
              padding: const EdgeInsets.symmetric(vertical: 16),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: _save,
            child: const Text('Save Contact & Settings', style: TextStyle(fontWeight: FontWeight.bold)),
          ),
        ],
      ),
    );
  }
}
