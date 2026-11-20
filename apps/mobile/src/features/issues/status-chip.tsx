import { StyleSheet, Text, View } from 'react-native';
import { statusGroup, type IssueStatus } from '@mana/core';
import { useI18n } from '@/i18n/i18n-provider';

const TONE = {
  open: { bg: '#fff7e6', fg: '#8a5300' },
  solved: { bg: '#eef7f1', fg: '#18613b' },
  closed_other: { bg: '#f2f2f0', fg: '#5f5f5a' },
} as const;

export function StatusChip({ status }: { status: IssueStatus }) {
  const { s } = useI18n();
  const tone = status === 'RESOLVED' ? { bg: '#e8f1fd', fg: '#0b4a8b' } : TONE[statusGroup(status)];
  return (
    <View style={[styles.chip, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{s.status[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  text: { fontSize: 13, fontWeight: '600' },
});
