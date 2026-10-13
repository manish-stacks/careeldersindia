import { Tabs } from 'expo-router';
import { tabScreen, useTabScreenOptions } from '@/lib/tabs';

export default function AssistantTabs() {
  const screenOptions = useTabScreenOptions();
  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="today" options={{ ...tabScreen('Today', 'sunny-outline', 'sunny'), headerShown: false }} />
      <Tabs.Screen name="jobs" options={tabScreen('Jobs', 'briefcase-outline', 'briefcase')} />
      <Tabs.Screen name="earnings" options={tabScreen('Earnings', 'stats-chart-outline', 'stats-chart')} />
      <Tabs.Screen name="me" options={tabScreen('Profile', 'person-circle-outline', 'person-circle')} />
    </Tabs>
  );
}
