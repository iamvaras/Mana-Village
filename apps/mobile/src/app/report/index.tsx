import { useEffect } from 'react';
import { router } from 'expo-router';
import { Body, Button, CenteredState, Choice, Notice, Screen, Title } from '@/components/ui';
import { categoryName } from '@/features/report/use-categories';
import { useReport } from '@/features/report/report-context';
import { StepFrame } from '@/features/report/step-frame';
import { useI18n } from '@/i18n/i18n-provider';

export default function CategoryStep() {
  const { s, language, errorText } = useI18n();
  const { phase, draft, categories, update, resume, startOver } = useReport();

  // After choosing "Continue", jump to the step the resident had reached.
  useEffect(() => {
    if (phase.kind === 'editing' && draft.step !== 'category') router.push(`/report/${draft.step}`);
    // Only when the phase changes (resume), not on every draft edit.
  }, [phase.kind]);

  if (phase.kind === 'loading') {
    return (
      <Screen scroll={false}>
        <CenteredState loading />
      </Screen>
    );
  }

  if (phase.kind === 'ask_resume') {
    return (
      <Screen>
        <Title>{s.report.resumeTitle}</Title>
        <Body muted>{s.report.resumeBody}</Body>
        <Button label={s.report.resumeContinue} onPress={resume} />
        <Button variant="secondary" label={s.report.resumeDiscard} onPress={startOver} />
      </Screen>
    );
  }

  return (
    <StepFrame step="category" title={s.report.categoryTitle}>
      {categories.isPending ? (
        <CenteredState loading />
      ) : categories.isError ? (
        <>
          <Notice tone="error">{errorText(categories.error)}</Notice>
          <Button
            variant="secondary"
            label={s.common.retry}
            onPress={() => void categories.refetch()}
          />
        </>
      ) : (
        categories.data.map((c) => (
          <Choice
            key={c.id}
            label={categoryName(c, language)}
            selected={draft.categoryId === c.id}
            onPress={() => void update({ categoryId: c.id })}
          />
        ))
      )}
    </StepFrame>
  );
}
