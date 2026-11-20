import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, CenteredState } from '@/components/ui';
import { colors, space } from '@/components/theme';
import { useReadyProfile } from '@/features/auth/session-provider';
import { AnnouncementCard } from '@/features/announcements/announcement-card';
import { useAnnouncements } from '@/features/announcements/hooks';
import { useI18n } from '@/i18n/i18n-provider';

export default function AnnouncementsScreen() {
  const { s, errorText } = useI18n();
  const profile = useReadyProfile();
  const list = useAnnouncements(profile.home_village_id);

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      <Stack.Screen options={{ headerShown: true, title: s.announcements.title }} />
      {list.isPending ? (
        <CenteredState loading />
      ) : list.isError ? (
        <CenteredState
          body={errorText(list.error)}
          action={<Button label={s.common.retry} onPress={() => void list.refetch()} />}
        />
      ) : (
        <FlatList
          data={list.data}
          keyExtractor={(a) => a.id}
          renderItem={({ item }) => <AnnouncementCard item={item} />}
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={list.isRefetching}
              onRefresh={() => void list.refetch()}
              tintColor={colors.brand}
            />
          }
          ListEmptyComponent={
            <CenteredState title={s.announcements.emptyTitle} body={s.announcements.emptyBody} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  list: { padding: space.xl, flexGrow: 1 },
  gap: { height: space.md },
});
