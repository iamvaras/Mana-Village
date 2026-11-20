import { StyleSheet, Switch, View } from 'react-native';
import { LIMITS } from '@mana/core';
import { Body, TextField } from '@/components/ui';
import { colors, space } from '@/components/theme';
import { useReport } from '@/features/report/report-context';
import { StepFrame } from '@/features/report/step-frame';
import { useI18n } from '@/i18n/i18n-provider';

export default function DetailsStep() {
  const { s } = useI18n();
  const { draft, update } = useReport();

  return (
    <StepFrame step="details" title={s.report.detailsTitle}>
      <TextField
        label={s.report.titleLabel}
        placeholder={s.report.titlePlaceholder}
        value={draft.title}
        onChangeText={(t) => void update({ title: t })}
        maxLength={LIMITS.titleMax}
      />
      <TextField
        label={s.report.descriptionLabel}
        placeholder={s.report.descriptionPlaceholder}
        value={draft.description}
        onChangeText={(t) => void update({ description: t })}
        maxLength={LIMITS.descriptionMax}
        multiline
        numberOfLines={5}
        textAlignVertical="top"
      />
      <View style={styles.row}>
        <View style={styles.flex}>
          <Body>{s.report.privateLabel}</Body>
          <Body muted>{s.report.privateHint}</Body>
        </View>
        <Switch
          accessibilityLabel={s.report.privateLabel}
          value={draft.isPrivate}
          onValueChange={(v) => void update({ isPrivate: v })}
          trackColor={{ true: colors.brand, false: colors.border }}
        />
      </View>
    </StepFrame>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  flex: { flex: 1, gap: space.xs },
});
