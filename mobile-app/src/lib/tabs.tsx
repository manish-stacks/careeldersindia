import type { ColorValue } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, F, S, TAB } from '@/lib/theme';

type Icon = keyof typeof Ionicons.glyphMap;

export const tabScreen = (title: string, icon: Icon, active: Icon) => ({
  title,
  tabBarIcon: ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <Ionicons name={focused ? active : icon} size={TAB.icon} color={color as string} />
  ),
});

// Shared tab bar options: fixed height + bottom safe-area inset, so the bar never gets clipped
// behind the Android gesture/navigation bar.
export function useTabScreenOptions() {
  const insets = useSafeAreaInsets();
  return {
    tabBarActiveTintColor: C.brand,
    tabBarInactiveTintColor: C.muted,
    tabBarLabelStyle: { fontFamily: F.medium, fontSize: TAB.label },
    tabBarStyle: {
      borderTopColor: C.line,
      backgroundColor: C.card,
      height: TAB.height + insets.bottom,
      paddingTop: S.xs,
      paddingBottom: Math.max(insets.bottom, S.sm),
    },
    headerTitleStyle: { fontFamily: F.semibold, fontSize: 18 },
    headerShadowVisible: false,
    headerStyle: { backgroundColor: C.canvas },
    sceneStyle: { backgroundColor: C.canvas },
  } as const;
}
