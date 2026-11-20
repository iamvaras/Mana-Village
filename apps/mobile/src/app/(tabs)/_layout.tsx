import { router, Tabs } from 'expo-router';
import { Text, type ColorValue } from 'react-native';
import { colors } from '@/components/theme';
import { useUnreadCount } from '@/features/issues/hooks';
import { useIsWorker } from '@/features/work/hooks';
import { useI18n } from '@/i18n/i18n-provider';

/** Simple text glyph icons; no icon library is added for a handful of tabs. */
const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ color, fontSize: 18 }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const { s } = useI18n();
  const unread = useUnreadCount();
  // Shown only to workers. Hiding the tab is for convenience; the database returns
  // nothing to anyone else.
  const worker = useIsWorker();
  const badge =
    unread.data && unread.data > 0 ? (unread.data > 99 ? '99+' : unread.data) : undefined;
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
      <Tabs.Screen
        name="work"
        options={{ title: s.tabs.work, tabBarIcon: icon('⚒'), ...(worker ? {} : { href: null }) }}
      />
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
        options={{
          title: s.tabs.notifications,
          tabBarIcon: icon('◔'),
          ...(badge !== undefined ? { tabBarBadge: badge } : {}),
        }}
      />
      <Tabs.Screen name="profile" options={{ title: s.tabs.profile, tabBarIcon: icon('◉') }} />
    </Tabs>
  );
}
