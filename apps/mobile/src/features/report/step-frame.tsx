import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Notice, Title } from '@/components/ui';
import { colors, space } from '@/components/theme';
import { useI18n } from '@/i18n/i18n-provider';
import { nextStep, REPORT_STEPS, stepProblem, type ReportStep } from './draft';
import { useReport } from './report-context';

/** Layout shared by every report step: progress, content, and a Next button. */
export function StepFrame({
  step,
  title,
  children,
  footer,
}: {
  step: ReportStep;
  title: string;
  children: ReactNode;
  /** Replaces the default Next button. */
  footer?: ReactNode;
}) {
  const { s, f } = useI18n();
  const { draft, category, update } = useReport();
  const problem = stepProblem(step, draft, category);
  const index = REPORT_STEPS.indexOf(step);

  function goNext() {
    if (problem) return;
    const next = nextStep(step, draft);
    void update({ step: next });
    router.push(next === 'category' ? '/report' : `/report/${next}`);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <Button
          variant="link"
          label={index === 0 ? s.report.close : s.report.back}
          onPress={() => router.back()}
        />
        <Text style={styles.stepText}>
          {f(s.report.stepOf, { n: String(index + 1), total: String(REPORT_STEPS.length) })}
        </Text>
      </View>
      <View style={styles.dots} accessibilityElementsHidden>
        {REPORT_STEPS.map((st, i) => (
          <View key={st} style={[styles.dot, i <= index && styles.dotActive]} />
        ))}
      </View>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Title>{title}</Title>
          {children}
        </ScrollView>
        <View style={styles.footer}>
          {footer ?? (
            <>
              {problem ? <Notice tone="info">{s.report.problems[problem]}</Notice> : null}
              <Button label={s.report.next} disabled={problem !== null} onPress={goNext} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.xl,
  },
  stepText: { color: colors.muted, fontSize: 14 },
  dots: {
    flexDirection: 'row',
    gap: space.xs,
    paddingHorizontal: space.xl,
    marginBottom: space.sm,
  },
  dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.brand },
  content: { padding: space.xl, gap: space.lg },
  footer: {
    padding: space.xl,
    paddingTop: space.md,
    gap: space.sm,
    borderTopWidth: 1,
    borderTopColor: '#e7e7e2',
    backgroundColor: colors.surface,
  },
});
