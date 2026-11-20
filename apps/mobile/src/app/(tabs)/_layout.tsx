import { router, Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { colors } from '@/components/theme';
import { useI18n } from '@/i18n/i18n-provider';

/** Simple text glyph icons; no icon library is added for four tabs. */
const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const { s } = useI18n();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontSize: 12 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: s.tabs.home, tabBarIcon: icon('⌂') }} />
      <Tabs.Screen name="my-issues" options={{ title: s.tabs.myIssues, tabBarIcon: icon('☰') }} />
      <Tabs.Screen
        name="report-tab"
        options={{ title: s.tabs.report, tabBarIcon: icon('＋') }}
        listeners={{
          tabPress: (e) => {
            // The report flow opens full screen instead of as a tab.
            e.preventDefault();
            router.push('/report');
          },
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{ title: s.tabs.notifications, tabBarIcon: icon('◔') }}
      />
      <Tabs.Screen name="profile" options={{ title: s.tabs.profile, tabBarIcon: icon('◉') }} />
    </Tabs>
  );
}
