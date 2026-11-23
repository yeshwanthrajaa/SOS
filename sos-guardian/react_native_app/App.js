import React, { useState, useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Alert,
  Vibration,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import SOSButton from './components/SOSButton';
import { EMERGENCY_TYPES, EmergencyEngine } from './services/EmergencyEngine';

export default function App() {
  const [tapCount, setTapCount] = useState(0);
  const [tapFeedback, setTapFeedback] = useState('Ready (Tap 1x, 2x, or 3x)');
  const [countdownModalVisible, setCountdownModalVisible] = useState(false);
  const [countdownRemaining, setCountdownRemaining] = useState(4);
  const [currentEmergency, setCurrentEmergency] = useState(null);

  const [contact, setContact] = useState({
    name: 'Primary Contact',
    phone: '+15551234567',
  });
  const [testMode, setTestMode] = useState(false);

  const tapTimerRef = useRef(null);
  const countdownTimerRef = useRef(null);

  // Reliable Multi-Tap Sequence Detection
  const handleButtonTap = () => {
    Vibration.vibrate(50);
    const newCount = tapCount + 1;
    setTapCount(newCount);

    let emergency = EMERGENCY_TYPES.CRIME;
    if (newCount === 2) emergency = EMERGENCY_TYPES.MEDICAL;
    if (newCount >= 3) emergency = EMERGENCY_TYPES.FIRE;

    setTapFeedback(`Tap ${Math.min(newCount, 3)}/3: ${emergency.label}`);

    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);

    if (newCount >= 3) {
      tapTimerRef.current = setTimeout(() => {
        finalizeTapSequence(3);
      }, 250);
    } else {
      tapTimerRef.current = setTimeout(() => {
        finalizeTapSequence(newCount);
      }, 850);
    }
  };

  const finalizeTapSequence = (count) => {
    setTapCount(0);
    setTapFeedback('Ready (Tap 1x, 2x, or 3x)');

    let emergency = EMERGENCY_TYPES.CRIME;
    if (count === 2) emergency = EMERGENCY_TYPES.MEDICAL;
    if (count >= 3) emergency = EMERGENCY_TYPES.FIRE;

    setCurrentEmergency(emergency);
    startCountdown(emergency);
  };

  const startCountdown = (emergency) => {
    setCountdownRemaining(4);
    setCountdownModalVisible(true);

    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);

    let remaining = 4;
    countdownTimerRef.current = setInterval(() => {
      remaining -= 1;
      setCountdownRemaining(remaining);
      if (remaining <= 0) {
        clearInterval(countdownTimerRef.current);
        setCountdownModalVisible(false);
        executeDispatch(emergency);
      }
    }, 1000);
  };

  const cancelEmergency = () => {
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    setCountdownModalVisible(false);
    Alert.alert('Cancelled', 'Emergency alert was aborted by user.');
  };

  const executeDispatch = async (emergency) => {
    try {
      const res = await EmergencyEngine.dispatchAlert({
        emergency,
        contact,
        isTestMode: testMode,
      });
      Alert.alert(
        'Alert Dispatched',
        `SMS, WhatsApp, and Call intents launched for ${contact.name} (${contact.phone}).\n\nEnsure prompts are confirmed on your device.`
      );
    } catch (e) {
      Alert.alert('Dispatch Error', e.message);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brandTitle}>SOS Guardian</Text>
        <Text style={styles.brandSubtitle}>Smart Emergency Alert</Text>
      </View>

      {/* Status Bar */}
      <View style={styles.statusStrip}>
        <View style={styles.statusPill}>
          <Text style={styles.pillLabel}>GPS</Text>
          <Text style={styles.pillValue}>ACTIVE</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.pillLabel}>CONTACT</Text>
          <Text style={styles.pillValue}>{contact.name}</Text>
        </View>
        <View style={styles.statusPill}>
          <Text style={styles.pillLabel}>BLE</Text>
          <Text style={styles.pillValue}>CONNECTED</Text>
        </View>
      </View>

      {/* SOS Button Center Zone */}
      <View style={styles.centerZone}>
        <View style={styles.badgeContainer}>
          <Text style={styles.badgeText}>{tapFeedback}</Text>
        </View>

        <SOSButton onPress={handleButtonTap} />
      </View>

      {/* Tap Guide Legend */}
      <View style={styles.instructionsCard}>
        <Text style={styles.instructionsHeader}>TAP DETECTION GUIDE</Text>
        <View style={styles.modesRow}>
          <View style={styles.modeItem}>
            <Text style={[styles.modeTaps, { color: '#EF4444' }]}>1x TAP</Text>
            <Text style={styles.modeName}>Crime</Text>
          </View>
          <View style={styles.modeItem}>
            <Text style={[styles.modeTaps, { color: '#2563EB' }]}>2x TAPS</Text>
            <Text style={styles.modeName}>Medical</Text>
          </View>
          <View style={styles.modeItem}>
            <Text style={[styles.modeTaps, { color: '#EA580C' }]}>3x TAPS</Text>
            <Text style={styles.modeName}>Fire</Text>
          </View>
        </View>
      </View>

      {/* Countdown Cancellation Modal */}
      <Modal visible={countdownModalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <Text style={styles.modalAlertHeader}>
              ⚠️ {currentEmergency?.label} Detected
            </Text>
            <Text style={styles.modalSub}>
              Alerting contact via SMS, WhatsApp, and phone call in:
            </Text>

            <View style={styles.countdownCircle}>
              <Text style={styles.countdownNum}>{countdownRemaining}</Text>
            </View>

            <TouchableOpacity style={styles.cancelButton} onPress={cancelEmergency}>
              <Text style={styles.cancelButtonText}>CANCEL / FALSE ALARM</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  brandTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  brandSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textTransform: 'uppercase',
  },
  statusStrip: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  statusPill: {
    flex: 1,
    backgroundColor: '#1E293B',
    padding: 8,
    borderRadius: 12,
    marginHorizontal: 3,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  pillLabel: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '700',
  },
  pillValue: {
    fontSize: 11,
    color: '#10B981',
    fontWeight: 'bold',
    marginTop: 2,
  },
  centerZone: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeContainer: {
    backgroundColor: '#1E293B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    marginBottom: 20,
  },
  badgeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
  instructionsCard: {
    backgroundColor: '#1E293B',
    margin: 20,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  instructionsHeader: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  modesRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  modeItem: {
    alignItems: 'center',
  },
  modeTaps: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  modeName: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(3, 7, 18, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    alignItems: 'center',
  },
  modalAlertHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#EF4444',
    textTransform: 'uppercase',
  },
  modalSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 6,
    textAlign: 'center',
  },
  countdownCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 30,
  },
  countdownNum: {
    fontSize: 64,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  cancelButton: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    padding: 18,
    borderRadius: 30,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#0F172A',
    fontWeight: '900',
    fontSize: 16,
  },
});
