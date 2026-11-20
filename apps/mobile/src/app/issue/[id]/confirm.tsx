import { useMemo, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { formatTimelineTime, type AppError } from '@mana/core';
import { REASON_MAX, REASON_MIN, resolutionSummary } from '@mana/services';
import { Body, Button, Card, CenteredState, Notice, TextField, Title } from '@/components/ui';
import { colors, space } from '@/components/theme';
import { useSession } from '@/features/auth/session-provider';
import { issueKeys, useIssue, usePhotos, useTimeline } from '@/features/issues/hooks';
import { StatusChip } from '@/features/issues/status-chip';
import { useAttachedPhotos } from '@/features/photos/attached-photos';
import { PhotoAttacher } from '@/features/photos/photo-attacher';
import { useI18n } from '@/i18n/i18n-provider';
import { services } from '@/lib/supabase';

type Step = 'ask' | 'not_solved' | 'thanks_solved' | 'thanks_not_solved';

/**
 * "Was it fixed?" (docs/issue-workflow.md §5). Only the reporter can answer; the
 * database checks that and the issue status again.
 */
export default function ConfirmResolutionScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { s, f, language, errorText } = useI18n();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const issue = useIssue(id);
  const timeline = useTimeline(id);
  const photos = usePhotos(id);
  const attached = useAttachedPhotos();
  const [step, setStep] = useState<Step>('ask');
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | undefined>(undefined);
  const locale = language === 'te' ? 'te-IN' : 'en-IN';
  const summary = useMemo(
    () => resolutionSummary(timeline.data ?? [], photos.data ?? []),
    [timeline.data, photos.data],
  );

  const header = <Stack.Screen options={{ headerShown: true, title: s.confirm.title }} />;

  if (issue.isPending) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <CenteredState loading />
      </SafeAreaView>
    );
  }
  if (issue.isError || !issue.data) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <CenteredState
          body={issue.isError ? errorText(issue.error) : s.issue.notFound}
          action={
            issue.isError ? (
              <Button label={s.common.retry} onPress={() => void issue.refetch()} />
            ) : undefined
          }
        />
      </SafeAreaView>
    );
  }

  const d = issue.data;

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: issueKeys.detail(id) }),
      queryClient.invalidateQueries({ queryKey: ['my-issues'] }),
      queryClient.invalidateQueries({ queryKey: issueKeys.notifications }),
    ]);
  }

  function showError(e: AppError) {
    setError(errorText(e));
    if (e.code === 'CONFLICT' || e.code === 'INVALID_TRANSITION') void refreshAll();
  }

  async function answerSolved() {
    if (!services) return;
    setError(null);
    setBusy(true);
    const res = await services.resolution.confirmSolved(id, d.version);
    setBusy(false);
    if (!res.ok) return showError(res.error);
    setStep('thanks_solved');
    await refreshAll();
  }

  async function answerNotSolved() {
    if (!services) return;
    if (reason.trim().length < REASON_MIN)
      return setFieldError(f(s.confirm.reasonShort, { n: String(REASON_MIN) }));
    const userId = session?.user.id;
    if (!userId) return;
    setFieldError(undefined);
    setError(null);
    setBusy(true);
    const up = await attached.upload(userId, (n, total) =>
      setBusyLabel(f(s.attach.uploading, { n: String(n), total: String(total) })),
    );
    setBusyLabel(undefined);
    if (!up.ok) {
      setBusy(false);
      return showError(up.error);
    }
    const res = await services.resolution.reportNotSolved(id, d.version, reason, up.value);
    setBusy(false);
    if (!res.ok) return showError(res.error);
    attached.clear();
    setStep('thanks_not_solved');
    await refreshAll();
  }

  if (step === 'thanks_solved' || step === 'thanks_not_solved') {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <CenteredState
          title={s.confirm.title}
          body={step === 'thanks_solved' ? s.confirm.thanksSolved : s.confirm.thanksNotSolved}
          action={<Button label={s.confirm.done} onPress={() => router.back()} />}
        />
      </SafeAreaView>
    );
  }

  // Already answered (or never ours): show where it stands instead of the buttons.
  if (d.status !== 'RESOLVED' || !d.isMine) {
    return (
      <SafeAreaView style={styles.safe}>
        {header}
        <View style={styles.content}>
          <StatusChip status={d.status} />
          <Title>{d.title}</Title>
          <Body muted>{d.isMine ? s.confirm.answered : s.confirm.notYours}</Body>
          <Button
            variant="secondary"
            label={s.confirm.back}
            onPress={() => router.replace({ pathname: '/issue/[id]', params: { id } })}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['left', 'right', 'bottom']}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Body muted>{d.issueNumber}</Body>
        <Title>{d.title}</Title>

        {photos.isPending ? (
          <CenteredState loading />
        ) : summary.photos.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.photos}
          >
            {summary.photos.map((p) =>
              p.url ? (
                <Image
                  key={p.id}
                  source={{ uri: p.url }}
                  style={styles.photo}
                  accessibilityLabel={s.issue.photos}
                />
              ) : (
                <View key={p.id} style={[styles.photo, styles.photoMissing]}>
                  <Text style={styles.small}>{s.issue.photoUnavailable}</Text>
                </View>
              ),
            )}
          </ScrollView>
        ) : (
          <Body muted>{s.confirm.noPhotos}</Body>
        )}

        {summary.note || summary.resolvedAt ? (
          <Card>
            {summary.note ? (
              <>
                <Text style={styles.small}>{s.confirm.workerNote}</Text>
                <Body>{summary.note}</Body>
              </>
            ) : null}
            {summary.resolvedAt ? (
              <Text style={styles.small}>
                {summary.resolvedByName
                  ? `${f(s.confirm.solvedBy, { name: summary.resolvedByName })} · `
                  : ''}
                {formatTimelineTime(summary.resolvedAt, locale)}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {error ? <Notice tone="error">{error}</Notice> : null}

        {step === 'ask' ? (
          <>
            <Text style={styles.question}>{s.confirm.question}</Text>
            <Button label={s.confirm.yes} busy={busy} onPress={() => void answerSolved()} />
            <Button
              variant="secondary"
              label={s.confirm.no}
              disabled={busy}
              onPress={() => {
                setError(null);
                setStep('not_solved');
              }}
            />
            <Body muted>{s.confirm.autoCloseHint}</Body>
          </>
        ) : (
          <>
            <Text style={styles.question}>{s.confirm.notSolvedTitle}</Text>
            <TextField
              label={s.confirm.reasonLabel}
              placeholder={s.confirm.reasonPlaceholder}
              value={reason}
              onChangeText={setReason}
              maxLength={REASON_MAX}
              multiline
              error={fieldError}
            />
            <Body muted>{s.confirm.photoHint}</Body>
            <PhotoAttacher photos={attached} busy={busy} onError={setError} />
            <Button
              label={s.confirm.send}
              busy={busy}
              {...(busyLabel ? { busyLabel } : {})}
              onPress={() => void answerNotSolved()}
            />
            <Button
              variant="link"
              label={s.confirm.back}
              disabled={busy}
              onPress={() => setStep('ask')}
            />
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: space.xl, gap: space.md },
  photos: { gap: space.sm },
  photo: { width: 200, height: 200, borderRadius: 8, backgroundColor: colors.border },
  photoMissing: { alignItems: 'center', justifyContent: 'center', padding: space.sm },
  small: { fontSize: 13, color: colors.muted },
  question: { fontSize: 20, fontWeight: '600', color: colors.text, marginTop: space.md },
});
