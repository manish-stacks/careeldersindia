import React, { useCallback, useEffect, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { C, F, R, S } from '@/lib/theme';
import { Button, T } from './ui';
import { registerPush } from '@/lib/push';
import { useAuth } from '@/lib/auth';

const STORAGE_KEY = '@careelders:prominent_disclosure_seen_v2';

type Listener = (open: boolean) => void;
const listeners = new Set<Listener>();

export function showPermissionDisclosure() {
  listeners.forEach((fn) => fn(true));
}

export function hidePermissionDisclosure() {
  listeners.forEach((fn) => fn(false));
}

export function PermissionDisclosureModal() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const handler: Listener = (val) => setOpen(val);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  // Open automatically on app launch if disclosure has not been acknowledged
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const seen = await AsyncStorage.getItem(STORAGE_KEY);
        if (!seen && mounted) {
          // Check if permissions are already fully granted; if not, open modal
          const fg = await Location.getForegroundPermissionsAsync().catch(() => null);
          if (!fg?.granted) {
            setOpen(true);
          }
        }
      } catch {
        // ignore storage error
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleDecline = useCallback(async () => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, 'dismissed');
    } catch {}
    setOpen(false);
  }, []);

  const handleAccept = useCallback(async () => {
    setBusy(true);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, 'granted');

      // 1. Request Foreground Location
      const fg = await Location.requestForegroundPermissionsAsync().catch(() => null);

      // 2. Request Background Location (for care assistants and Android visit tracking)
      if (fg?.granted) {
        try {
          const bgStatus = await Location.getBackgroundPermissionsAsync().catch(() => null);
          if (!bgStatus?.granted && bgStatus?.canAskAgain) {
            await Location.requestBackgroundPermissionsAsync().catch(() => {});
          }
        } catch {
          // background request may fail in Expo Go or if user declines
        }
      }

      // 3. Register Push Notifications
      await registerPush().catch(() => {});
    } catch {
      // ignore
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }, []);

  if (!open) return null;

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={handleDecline}>
      <View style={styles.scrim}>
        <View style={[styles.dialog, { paddingBottom: Math.max(insets.bottom, S.lg) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.badge}>
              <Ionicons name="shield-checkmark" size={18} color={C.brand} />
              <T weight="semibold" style={{ color: C.brand, fontSize: 13 }}>
                Google Play & Apple Privacy Disclosure
              </T>
            </View>
            <T v="title" style={{ marginTop: S.sm }}>
              Permissions & Care Visit Safety
            </T>
            <T v="small" style={{ marginTop: 2, color: C.muted }}>
              Care Elders India requires location and notification access to deliver reliable, transparent elderly care.
            </T>
          </View>

          {/* Body */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Location Disclosure - Mandatory for Google Play Prominent Disclosure */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#E0F2FE' }]}>
                  <Ionicons name="location" size={22} color={C.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <T weight="bold" style={{ fontSize: 16 }}>
                    Live Visit & Journey Location Tracking
                  </T>
                  <T weight="semibold" style={{ fontSize: 12, color: C.brand, marginTop: 1 }}>
                    Foreground & Background Location
                  </T>
                </View>
              </View>

              <View style={styles.prominentBox}>
                <T weight="semibold" style={styles.prominentText}>
                  Care Elders India collects location data during care assistant visits to verify travel and arrival at the elderly parent’s home, and to provide real-time updates to families, even when the app is closed or not in use.
                </T>
              </View>

              <View style={styles.bulletList}>
                <View style={styles.bulletRow}>
                  <Ionicons name="checkmark-circle" size={16} color={C.ok} style={{ marginTop: 2 }} />
                  <T v="small" style={styles.bulletText}>
                    <T weight="semibold">Only during active visits:</T> Tracking starts strictly when an assistant taps "Start travel" to an elderly parent's home.
                  </T>
                </View>
                <View style={styles.bulletRow}>
                  <Ionicons name="checkmark-circle" size={16} color={C.ok} style={{ marginTop: 2 }} />
                  <T v="small" style={styles.bulletText}>
                    <T weight="semibold">Stops automatically:</T> Sharing ends immediately when the assistant arrives and marks "I've arrived".
                  </T>
                </View>
                <View style={styles.bulletRow}>
                  <Ionicons name="checkmark-circle" size={16} color={C.ok} style={{ marginTop: 2 }} />
                  <T v="small" style={styles.bulletText}>
                    <T weight="semibold">Private to the family:</T> Real-time location is shared only with the booked parent’s family and our care desk. We never sell or share location data.
                  </T>
                </View>
              </View>
            </View>

            {/* Notifications */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#FEF3C7' }]}>
                  <Ionicons name="notifications" size={22} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <T weight="bold" style={{ fontSize: 16 }}>
                    Visit Alerts & Emergency SOS
                  </T>
                  <T v="small" style={{ color: C.muted, marginTop: 2 }}>
                    Used to send timely visit updates, assistant arrival alerts, vital health reports, and critical emergency SOS notifications to families.
                  </T>
                </View>
              </View>
            </View>

            {/* Camera & Prescriptions */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={[styles.iconCircle, { backgroundColor: '#F3E8FF' }]}>
                  <Ionicons name="camera" size={22} color="#9333EA" />
                </View>
                <View style={{ flex: 1 }}>
                  <T weight="bold" style={{ fontSize: 16 }}>
                    Camera & Medical Documents
                  </T>
                  <T v="small" style={{ color: C.muted, marginTop: 2 }}>
                    Used only when you choose to photograph prescriptions, medication labels, or test records during parent visits.
                  </T>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <Button
              title="I Understand & Continue"
              loading={busy}
              onPress={handleAccept}
              icon="checkmark-outline"
            />
            <Pressable
              onPress={handleDecline}
              disabled={busy}
              style={({ pressed }) => [styles.declineBtn, { opacity: pressed ? 0.7 : 1 }]}
            >
              <T weight="medium" style={{ color: C.muted, fontSize: 14 }}>
                Not Now / Review Later
              </T>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  dialog: {
    backgroundColor: C.card,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingTop: S.lg,
    paddingHorizontal: S.lg,
  },
  header: {
    marginBottom: S.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#E0F2FE',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: R.pill,
  },
  scroll: {
    maxHeight: 460,
  },
  scrollContent: {
    gap: S.md,
    paddingBottom: S.md,
  },
  card: {
    backgroundColor: C.canvas,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.lg,
    padding: S.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: S.md,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prominentBox: {
    marginTop: S.sm,
    backgroundColor: '#EFF6FF',
    borderLeftWidth: 4,
    borderLeftColor: C.brand,
    padding: S.sm,
    borderRadius: R.sm,
  },
  prominentText: {
    fontSize: 13,
    lineHeight: 19,
    color: '#1E3A8A',
  },
  bulletList: {
    marginTop: S.sm,
    gap: 6,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: C.ink,
  },
  footer: {
    paddingTop: S.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
    gap: S.sm,
  },
  declineBtn: {
    alignItems: 'center',
    paddingVertical: S.xs,
  },
});
