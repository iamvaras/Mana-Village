import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { isOverdue, type WorkItem } from '@mana/services';
import { colors, space } from '@/components/theme';
import { StatusChip } from '@/features/issues/status-chip';
import { useI18n } from '@/i18n/i18n-provider';

export function WorkCard({ item }: { item: WorkItem }) {
  const { s, f, language } = useI18n();
  const locale = language === 'te' ? 'te-IN' : 'en-IN';
  const category =
    language === 'te' && item.categoryNameLocal ? item.categoryNameLocal : item.categoryName;
  const overdue = isOverdue(item);
  const urgent =
    item.priority === 'CRITICAL'
      ? s.work.urgent
      : item.priority === 'HIGH'
        ? s.work.highPriority
        : null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/issue/[id]', params: { id: item.issueId } })}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.row}>
        <StatusChip status={item.status} />
        <Text style={styles.meta}>{item.issueNumber}</Text>
      </View>
      <Text style={styles.title} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={styles.meta} numberOfLines={1}>
        {category}
        {item.locationText ? ` · ${item.locationText}` : ''}
      </Text>
      <View style={styles.tags}>
        {urgent ? <Text style={[styles.tag, styles.tagUrgent]}>{urgent}</Text> : null}
        {overdue ? <Text style={[styles.tag, styles.tagUrgent]}>{s.work.overdue}</Text> : null}
        {!item.assignedToMe ? (
          <Text style={styles.tag}>
            {f(s.work.department, { department: item.departmentName })} · {s.work.forDepartment}
          </Text>
        ) : null}
        {item.dueAt && !overdue ? (
          <Text style={styles.tag}>
            {f(s.work.due, { date: new Date(item.dueAt).toLocaleDateString(locale) })}
          </Text>
        ) : null}
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
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 17, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.muted },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: space.xs },
  tag: {
    fontSize: 12,
    color: colors.info,
    backgroundColor: colors.infoSoft,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
  },
  tagUrgent: { color: colors.danger, backgroundColor: colors.dangerSoft },
});
