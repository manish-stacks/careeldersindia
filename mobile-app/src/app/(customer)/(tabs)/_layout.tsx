import { Tabs } from 'expo-router';
import { tabScreen, useTabScreenOptions } from '@/lib/tabs';

export default function CustomerTabs() {
  const screenOptions = useTabScreenOptions();
  return (
    <Tabs screenOptions={screenOptions}>
      <Tabs.Screen name="home" options={{ ...tabScreen('Home', 'home-outline', 'home'), headerShown: false }} />
      <Tabs.Screen name="visits" options={tabScreen('Visits', 'calendar-outline', 'calendar')} />
      <Tabs.Screen name="parents" options={tabScreen('Parents', 'heart-outline', 'heart')} />
      <Tabs.Screen name="reports" options={tabScreen('Reports', 'document-text-outline', 'document-text')} />
      <Tabs.Screen name="account" options={tabScreen('Account', 'person-circle-outline', 'person-circle')} />
    </Tabs>
  );
}
