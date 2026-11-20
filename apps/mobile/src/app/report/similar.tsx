import { useState } from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import type { AppError } from '@mana/core';
import type { SimilarIssue } from '@mana/services';
import { Body, Button, Card, CenteredState, Notice } from '@/components/ui';
import { useReport } from '@/features/report/report-context';
import { StepFrame } from '@/features/report/step-frame';
import { useI18n } from '@/i18n/i18n-provider';
import { services } from '@/lib/supabase';

export default function SimilarStep() {
  const { s, f, errorText } = useI18n();
  const { draft, update, discard } = useReport();
  const [supported, setSupported] = useState<ReadonlySet<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gps = draft.gps;
  const similar = useQuery<SimilarIssue[], AppError>({
    queryKey: ['similar', draft.villageId, draft.categoryId, gps?.latitude, gps?.longitude],
    enabled: Boolean(services && gps && draft.categoryId),
    queryFn: async () => {
      if (!services || !gps || !draft.categoryId) return [];
      const res = await services.issues.findSimilar({
        villageId: draft.villageId,
        categoryId: draft.categoryId,
        latitude: gps.latitude,
        longitude: gps.longitude,
      });
      if (!res.ok) throw res.error;
      return res.value;
    },
  });

  async function support(id: string) {
    if (!services) return;
    setError(null);
    setBusyId(id);
    const res = await services.issues.support(id);
    setBusyId(null);
    if (!res.ok) return setError(errorText(res.error));
    setSupported((prev) => new Set(prev).add(id));
  }

  function finishWithSupport() {
    // The resident joined an existing report, so this draft is no longer needed.
    discard();
    router.dismissAll();
  }

  const anySupported = supported.size > 0 || (similar.data ?? []).some((i) => i.iSupport);
  const continueButton = (
    <Button
      variant={anySupported ? 'secondary' : 'primary'}
      label={s.report.mineIsDifferent}
      onPress={() => {
        void update({ step: 'details' });
        router.push('/report/details');
      }}
    />
  );

  return (
    <StepFrame
      step="similar"
      title={s.report.similarTitle}
      footer={
        anySupported ? (
          <>
            <Notice tone="info">{s.report.doneSupported}</Notice>
            <Button label={s.report.finishSupported} onPress={finishWithSupport} />
            {continueButton}
          </>
        ) : (
          continueButton
        )
      }
    >
      {similar.isPending ? (
        <CenteredState loading body={s.report.similarLoading} />
      ) : similar.isError ? (
        <Notice tone="info">{s.report.similarFailed}</Notice>
      ) : similar.data.length === 0 ? (
        <Body muted>{s.report.similarNone}</Body>
      ) : (
        <>
          <Body muted>{s.report.similarHint}</Body>
          {error ? <Notice tone="error">{error}</Notice> : null}
          {similar.data.map((issue) => {
            const done = issue.iSupport || supported.has(issue.id);
            return (
              <Card key={issue.id}>
                <Body>{issue.title}</Body>
                <Body muted>
                  {issue.issueNumber} · {f(s.report.distance, { m: String(issue.distanceM) })} ·{' '}
                  {f(s.report.supporters, {
                    n: String(
                      issue.supporterCount + (supported.has(issue.id) && !issue.iSupport ? 1 : 0),
                    ),
                  })}
                </Body>
                <Button
                  variant="secondary"
                  label={done ? s.report.affectedDone : s.report.affected}
                  disabled={done}
                  busy={busyId === issue.id}
                  onPress={() => void support(issue.id)}
                />
              </Card>
            );
          })}
        </>
      )}
    </StepFrame>
  );
}
