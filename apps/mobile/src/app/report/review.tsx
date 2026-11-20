import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { AppError } from '@mana/core';
import { Body, Button, Card, Notice } from '@/components/ui';
import { space } from '@/components/theme';
import { effectiveTitle, stepProblem, type ReportStep } from '@/features/report/draft';
import { discardDraft, readPhotoBytes } from '@/features/report/draft-store';
import { useReport } from '@/features/report/report-context';
import { StepFrame } from '@/features/report/step-frame';
import { submitDraft, type SubmitProgress } from '@/features/report/submit';
import { categoryName } from '@/features/report/use-categories';
import { useI18n } from '@/i18n/i18n-provider';
import { services } from '@/lib/supabase';

export default function ReviewStep() {
  const { s, f, language, errorText } = useI18n();
  const { draft, category, update } = useReport();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<SubmitProgress | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const problem = stepProblem('review', draft, category);
  const name = category ? categoryName(category, language) : '';

  async function send() {
    if (!services || !category || problem) return;
    const svc = services;
    setError(null);
    setProgress({ stage: 'uploading', done: 0, total: draft.photos.length });
    const outcome = await submitDraft(draft, name, {
      uploadPhoto: async (photo, userId) => {
        let body: Uint8Array;
        try {
          body = await readPhotoBytes(photo.localUri);
        } catch {
          return { ok: false, error: { code: 'UPLOAD_FAILED', message: 'photo file missing' } };
        }
        return svc.issues.uploadPhoto({
          id: photo.id,
          userId,
          mimeType: 'image/jpeg',
          body,
          width: photo.width,
          height: photo.height,
        });
      },
      createIssue: (input, photos) => svc.issues.createIssue(input, photos),
      saveDraft: (d) => update(d),
      onProgress: setProgress,
    });
    setProgress(null);
    if (!outcome.ok) {
      setError(outcome.error);
      return;
    }
    discardDraft();
    await queryClient.invalidateQueries({ queryKey: ['my-issues'] });
    router.dismissAll();
    router.replace({ pathname: '/report-sent', params: { number: outcome.issue.issueNumber } });
  }

  const edit = (step: ReportStep) => () =>
    router.push(step === 'category' ? '/report' : `/report/${step}`);
  const sending = progress !== null;
  const progressText =
    progress?.stage === 'uploading'
      ? f(s.report.sendingPhotos, {
          n: String(Math.min(progress.done + 1, progress.total)),
          total: String(progress.total),
        })
      : progress?.stage === 'creating'
        ? s.report.creating
        : null;

  return (
    <StepFrame
      step="review"
      title={s.report.reviewTitle}
      footer={
        <>
          {problem ? <Notice tone="info">{s.report.problems[problem]}</Notice> : null}
          {error ? (
            <Notice tone="error">
              {error.code === 'NETWORK' ? s.report.sendFailedNetwork : errorText(error)}
            </Notice>
          ) : null}
          {progressText ? <Body muted>{progressText}</Body> : null}
          <Button
            label={s.report.send}
            busy={sending}
            disabled={problem !== null}
            onPress={() => void send()}
          />
        </>
      }
    >
      <Card>
        <Body muted>{s.report.category}</Body>
        <Body>{name}</Body>
        <Body>{category ? effectiveTitle(draft, name) : ''}</Body>
        {draft.description.trim() ? <Body muted>{draft.description.trim()}</Body> : null}
        <Button variant="link" label={s.report.edit} disabled={sending} onPress={edit('details')} />
      </Card>
      <Card>
        <Body muted>{s.report.photos}</Body>
        <View style={styles.thumbs}>
          {draft.photos.map((p) => (
            <Image
              key={p.id}
              source={{ uri: p.localUri }}
              style={styles.thumb}
              accessibilityIgnoresInvertColors
            />
          ))}
        </View>
        <Button variant="link" label={s.report.edit} disabled={sending} onPress={edit('photos')} />
      </Card>
      <Card>
        <Body muted>{s.report.location}</Body>
        <Body>{draft.gps ? s.report.gpsSaved : s.report.noGps}</Body>
        {draft.landmark.trim() ? <Body>{draft.landmark.trim()}</Body> : null}
        <Button
          variant="link"
          label={s.report.edit}
          disabled={sending}
          onPress={edit('location')}
        />
      </Card>
      <Card>
        <Body muted>{s.report.visibility}</Body>
        <Body>{draft.isPrivate ? s.report.visibilityPrivate : s.report.visibilityPublic}</Body>
      </Card>
      <Body muted>{s.report.savedNote}</Body>
    </StepFrame>
  );
}

const styles = StyleSheet.create({
  thumbs: { flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' },
  thumb: { width: 72, height: 72, borderRadius: 6 },
});
