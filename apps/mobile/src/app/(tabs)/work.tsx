import { useMemo } from 'react';
import { RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { groupWork, type WorkGroup } from '@mana/services';
import { Button, CenteredState, Title } from '@/components/ui';
import { colors, space } from '@/components/theme';
import { useIsWorker, useMyWork } from '@/features/work/hooks';
import { WorkCard } from '@/features/work/work-card';
import { useI18n } from '@/i18n/i18n-provider';

/** The worker's own active work (docs/ui-ux.md §2.3). The database returns only their work. */
export default function WorkScreen() {
  const { s, errorText } = useI18n();
  const worker = useIsWorker();
  const work = useMyWork(worker);
  const sections = useMemo(
    () => groupWork(work.data ?? []).map((g) => ({ key: g.group, data: g.items })),
    [work.data],
  );
  const groupTitle: Record<WorkGroup, string> = {
    reopened: s.work.groupReopened,
    new: s.work.groupNew,
    in_progress: s.work.groupInProgress,
    waiting: s.work.groupWaiting,
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Title>{s.work.title}</Title>
      </View>
      {!worker ? (
        <CenteredState title={s.work.emptyTitle} body={s.work.emptyBody} />
      ) : work.isPending ? (
        <CenteredState loading />
      ) : work.isError ? (
        <CenteredState
          body={errorText(work.error)}
          action={<Button label={s.common.retry} onPress={() => void work.refetch()} />}
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(i) => i.assignmentId}
          renderItem={({ item }) => <WorkCard item={item} />}
          renderSectionHeader={({ section }) => (
            <Text style={styles.section} accessibilityRole="header">
              {groupTitle[section.key]} · {section.data.length}
            </Text>
          )}
          ItemSeparatorComponent={() => <View style={styles.gap} />}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={work.isRefetching}
              onRefresh={() => void work.refetch()}
              tintColor={colors.brand}
            />
          }
          ListEmptyComponent={<CenteredState title={s.work.emptyTitle} body={s.work.emptyBody} />}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: space.xl, paddingBottom: space.sm },
  list: { padding: space.xl, paddingTop: 0, flexGrow: 1 },
  section: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.muted,
    marginTop: space.lg,
    marginBottom: space.sm,
  },
  gap: { height: space.md },
});
