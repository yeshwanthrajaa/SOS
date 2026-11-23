import 'package:flutter/material.dart';

enum EmergencyCategory { crime, medical, fire }

class EmergencyType {
  final EmergencyCategory category;
  final String title;
  final String subtitle;
  final String tapInstruction;
  final Color themeColor;
  final IconData icon;
  final String baseMessage;

  const EmergencyType({
    required this.category,
    required this.title,
    required this.subtitle,
    required this.tapInstruction,
    required this.themeColor,
    required this.icon,
    required this.baseMessage,
  });

  static const EmergencyType crime = EmergencyType(
    category: EmergencyCategory.crime,
    title: 'Crime & Safety Emergency',
    subtitle: 'Immediate personal danger',
    tapInstruction: '1x Tap',
    themeColor: Color(0xFFEF4444), // Red
    icon: Icons.shield,
    baseMessage: 'CRIME EMERGENCY! I am in immediate personal danger and need help urgently.',
  );

  static const EmergencyType medical = EmergencyType(
    category: EmergencyCategory.medical,
    title: 'Medical Emergency',
    subtitle: 'Urgent medical assistance',
    tapInstruction: '2x Taps',
    themeColor: Color(0xFF2563EB), // Blue
    icon: Icons.local_hospital,
    baseMessage: 'MEDICAL EMERGENCY! I need urgent medical assistance.',
  );

  static const EmergencyType fire = EmergencyType(
    category: EmergencyCategory.fire,
    title: 'Fire Emergency',
    subtitle: 'Fire & rescue assistance',
    tapInstruction: '3x Taps',
    themeColor: Color(0xFFEA580C), // Orange
    icon: Icons.local_fire_department,
    baseMessage: 'FIRE EMERGENCY! Fire assistance is needed urgently.',
  );

  static EmergencyType fromTapCount(int count) {
    if (count == 1) return crime;
    if (count == 2) return medical;
    return fire;
  }
}
