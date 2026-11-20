import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { formatTimelineTime } from '@mana/core';
import type { AppNotification } from '@mana/services';
import { Button, CenteredState, Title } from '@/components/ui';
import { colors, space } from '@/components/theme';
import { issueKeys, useNotifications } from '@/features/issues/hooks';
import { openPushTarget } from '@/features/push/use-push';
import { useI18n } from '@/i18n/i18n-provider';
import { services } from '@/lib/supabase';

/** Opens what the alert is about; only known screens are accepted (see push-route). */
function openRoute(n: AppNotification): void {
  if (n.route) openPushTarget({ route: n.route });
  else if (n.issueId) router.push({ pathname: '/issue/[id]', params: { id: n.issueId } });
}

export default function NotificationsScreen() {
  const { s, language, errorText } = useI18n();
  const queryClient = useQueryClient();
  const list = useNotifications();
  const locale = language === 'te' ? 'te-IN' : 'en-IN';
  const hasUnread = (list.data ?? []).some((n) => !n.readAt);

  const refreshAll = () => queryClient.invalidateQueries({ queryKey: issueKeys.notifications });

  async function open(n: AppNotification) {
    if (!n.readAt && services) {
      void services.notifications.markRead(n.id).then(refreshAll);
    }
    openRoute(n);
  }

  async function markAll() {
    if (!services) return;
    await services.notifications.markAllRead();
    await refreshAll();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Title>{s.notifications.title}</Title>
        {hasUnread ? (
          <Button
            variant="link"
            label={s.notifications.markAllRead}
            onPress={() => void markAll()}
          />
        ) : null}
      </View>
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
          keyExtractor={(n) => n.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={list.isRefetching}
              onRefresh={() => void list.refetch()}
              tintColor={colors.brand}
            />
          }
          ListEmptyComponent={
            <CenteredState title={s.notifications.emptyTitle} body={s.notifications.emptyBody} />
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              onPress={() => void open(item)}
              style={({ pressed }) => [
                styles.item,
                !item.readAt && styles.unread,
                pressed && styles.pressed,
              ]}
            >
              {!item.readAt ? <View style={styles.badge} accessibilityLabel="unread" /> : null}
              <View style={styles.itemBody}>
                <Text style={[styles.title, !item.readAt && styles.titleUnread]}>{item.title}</Text>
                <Text style={styles.body} numberOfLines={2}>
                  {item.body}
                </Text>
                <Text style={styles.time}>{formatTimelineTime(item.createdAt, locale)}</Text>
              </View>
            </Pressable>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: {
    padding: space.xl,
    paddingBottom: space.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  list: { padding: space.xl, paddingTop: space.sm, gap: space.sm, flexGrow: 1 },
  item: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: space.lg,
    borderWidth: 1,
    borderColor: '#e7e7e2',
  },
  unread: { borderColor: colors.brand, backgroundColor: colors.brandSoft },
  pressed: { opacity: 0.85 },
  badge: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand, marginTop: 6 },
  itemBody: { flex: 1, gap: 2 },
  title: { fontSize: 16, color: colors.text },
  titleUnread: { fontWeight: '600' },
  body: { fontSize: 14, color: colors.muted },
  time: { fontSize: 12, color: colors.muted },
});
