import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatTimelineTime } from '@mana/core';
import type { IssueSummary } from '@mana/services';
import { colors, space } from '@/components/theme';
import { useI18n } from '@/i18n/i18n-provider';
import { StatusChip } from './status-chip';

export function IssueCard({ issue }: { issue: IssueSummary }) {
  const { s, f, language } = useI18n();
  const category =
    language === 'te' && issue.categoryNameLocal ? issue.categoryNameLocal : issue.categoryName;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/issue/[id]', params: { id: issue.id } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <StatusChip status={issue.status} />
        <Text style={styles.meta}>{issue.issueNumber}</Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {issue.title}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {category}
        {issue.locationText ? ` · ${issue.locationText}` : ''}
      </Text>
      <View style={styles.row}>
        <Text style={styles.meta}>
          {formatTimelineTime(issue.lastStatusChangeAt, language === 'te' ? 'te-IN' : 'en-IN')}
        </Text>
        <Text style={styles.meta}>
          {!issue.isMine && issue.iSupport ? `${s.myIssues.supported} · ` : ''}
          {f(s.issue.affected, { n: String(issue.supporterCount) })}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: space.lg,
    gap: space.xs,
    borderWidth: 1,
    borderColor: '#e7e7e2',
  },
  pressed: { opacity: 0.85 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: space.sm,
  },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
});
