import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { C, R } from '@/lib/theme';

type LatLng = { latitude: number; longitude: number };

export function TrackMap({ assistant, home, height = 240 }: { assistant?: LatLng | null; home?: LatLng | null; height?: number }) {
  const ref = useRef<MapView>(null);
  const pts = [assistant, home].filter(Boolean) as LatLng[];
  useEffect(() => {
    if (!ref.current || !pts.length) return;
    if (pts.length === 1) ref.current.animateToRegion({ ...pts[0], latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
    else ref.current.fitToCoordinates(pts, { edgePadding: { top: 60, bottom: 60, left: 60, right: 60 }, animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assistant?.latitude, assistant?.longitude, home?.latitude, home?.longitude]);
  const initial = pts[0] || { latitude: 28.6139, longitude: 77.209 };
  return (
    <View style={[styles.wrap, { height }]}>
      <MapView ref={ref} style={StyleSheet.absoluteFill} initialRegion={{ ...initial, latitudeDelta: 0.05, longitudeDelta: 0.05 }} toolbarEnabled={false}>
        {home && (
          <Marker coordinate={home} title="Home" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.home}>
              <Ionicons name="home" size={16} color={C.ink} />
            </View>
          </Marker>
        )}
        {assistant && (
          <Marker coordinate={assistant} title="Care assistant" anchor={{ x: 0.5, y: 0.5 }}>
            <View style={styles.dotOuter}>
              <View style={styles.dot} />
            </View>
          </Marker>
        )}
        {assistant && home && <Polyline coordinates={[assistant, home]} strokeColor={C.brand} strokeWidth={3} lineDashPattern={[8, 8]} />}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: R.lg, overflow: 'hidden', backgroundColor: C.line },
  home: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#fff', borderWidth: 2, borderColor: C.ink, alignItems: 'center', justifyContent: 'center' },
  dotOuter: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(200,53,46,0.25)', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.brand, borderWidth: 3, borderColor: '#fff' },
});
