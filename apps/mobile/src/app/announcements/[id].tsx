import { ScrollView, StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { announcementText } from '@mana/services';
import { Body, Button, CenteredState, Title } from '@/components/ui';
import { colors, space } from '@/components/theme';
import { useAnnouncement } from '@/features/announcements/hooks';
import { useI18n } from '@/i18n/i18n-provider';

export default function AnnouncementScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { s, language, errorText } = useI18n();
  const item = useAnnouncement(id);
  const locale = language === 'te' ? 'te-IN' : 'en-IN';
  const header = <Stack.Screen options={{ headerShown: true, title: s.announcements.title }} />;

  if (item.isPending)
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <CenteredState loading />
      </SafeAreaView>
    );
  if (item.isError || !item.data)
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <CenteredState
          body={item.isError ? errorText(item.error) : s.announcements.notFound}
          action={
            item.isError ? (
              <Button label={s.common.retry} onPress={() => void item.refetch()} />
            ) : undefined
          }
        />
      </SafeAreaView>
    );

  const a = item.data;
  const text = announcementText(a, language);
  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <Title>{text.title}</Title>
        {a.publishedAt ? (
          <Body muted>
            {new Date(a.publishedAt).toLocaleDateString(locale, {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </Body>
        ) : null}
        <Body>{text.body}</Body>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.xl, gap: space.md },
});
