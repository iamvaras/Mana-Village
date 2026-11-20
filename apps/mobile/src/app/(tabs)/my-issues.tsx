import { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MyIssuesFilter } from '@mana/services';
import { Button, CenteredState, Choice, Title } from '@/components/ui';
import { colors, space } from '@/components/theme';
import { useMyIssues } from '@/features/issues/hooks';
import { IssueCard } from '@/features/issues/issue-card';
import { useI18n } from '@/i18n/i18n-provider';

export default function MyIssuesScreen() {
  const { s, errorText } = useI18n();
  const [filter, setFilter] = useState<MyIssuesFilter>('open');
  const issues = useMyIssues(filter);
  const filters: [MyIssuesFilter, string][] = [
    ['open', s.myIssues.filterOpen],
    ['solved', s.myIssues.filterSolved],
    ['all', s.myIssues.filterAll],
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Title>{s.myIssues.title}</Title>
        <View style={styles.filters} accessibilityRole="radiogroup">
          {filters.map(([key, label]) => (
            <View key={key} style={styles.filter}>
              <Choice label={label} selected={filter === key} onPress={() => setFilter(key)} />
            </View>
          ))}
        </View>
      </View>
      {issues.isPending ? (
        <CenteredState loading />
      ) : issues.isError ? (
        <CenteredState
          body={errorText(issues.error)}
          action={<Button label={s.common.retry} onPress={() => void issues.refetch()} />}
        />
      ) : (
        <FlatList
          data={issues.data}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <IssueCard issue={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={issues.isRefetching}
              onRefresh={() => void issues.refetch()}
              tintColor={colors.brand}
            />
          }
          ListEmptyComponent={
            <CenteredState
              title={filter === 'all' ? s.myIssues.emptyTitle : undefined}
              body={filter === 'all' ? s.myIssues.emptyBody : s.myIssues.emptyFiltered}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { padding: space.xl, paddingBottom: space.sm, gap: space.md },
  filters: { flexDirection: 'row', gap: space.sm },
  filter: { flex: 1 },
  list: { padding: space.xl, paddingTop: space.sm, gap: space.md, flexGrow: 1 },
});
