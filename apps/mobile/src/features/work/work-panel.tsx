import { useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  PROGRESS_NOTE_MAX,
  REASON_MAX,
  REASON_MIN,
  workSteps,
  type UploadedPhoto,
  type WorkItem,
} from '@mana/services';
import type { AppError, Result } from '@mana/core';
import { Body, Button, Card, Notice, TextField } from '@/components/ui';
import { colors, space } from '@/components/theme';
import { useSession } from '@/features/auth/session-provider';
import { issueKeys } from '@/features/issues/hooks';
import { useI18n } from '@/i18n/i18n-provider';
import { services } from '@/lib/supabase';
import { workKeys } from './hooks';
import { PhotoAttacher } from '@/features/photos/photo-attacher';
import { useAttachedPhotos } from '@/features/photos/attached-photos';

type Mode = 'idle' | 'decline' | 'progress' | 'resolve';

/**
 * The worker's steps on an issue they are assigned to. Which buttons show comes
 * from workSteps; the database checks every step again.
 */
export function WorkPanel({ item }: { item: WorkItem }) {
  const { s, f, errorText } = useI18n();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const photos = useAttachedPhotos();
  const [mode, setMode] = useState<Mode>('idle');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState<string | null>(null);
  // The version this screen last saw; each step returns the next one.
  const [knownVersion, setKnownVersion] = useState(item.version);
  const version = Math.max(knownVersion, item.version);
  const steps = workSteps(item);

  function open(next: Mode) {
    setMode(next);
    setText('');
    setError(null);
    setFieldError(undefined);
    setDone(null);
    photos.clear();
  }

  async function refreshAll() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: workKeys.mine }),
      queryClient.invalidateQueries({ queryKey: issueKeys.detail(item.issueId) }),
      queryClient.invalidateQueries({ queryKey: ['my-issues'] }),
    ]);
  }

  /** Runs one step; on success shows the message and refreshes the screen. */
  async function act<T>(call: () => Promise<Result<T>>, message: string): Promise<void> {
    setError(null);
    setBusy(true);
    let res: Result<T>;
    try {
      res = await call();
    } catch {
      res = { ok: false, error: { code: 'UNKNOWN', message: 'step failed' } };
    }
    setBusy(false);
    setBusyLabel(undefined);
    if (!res.ok) return showError(res.error);
    if (typeof res.value === 'number') setKnownVersion(res.value);
    setMode('idle');
    setText('');
    photos.clear();
    setDone(message);
    await refreshAll();
  }

  function showError(e: AppError) {
    setError(errorText(e));
    // Someone else changed it meanwhile: load the latest so the next try can work.
    if (e.code === 'CONFLICT' || e.code === 'INVALID_TRANSITION') void refreshAll();
  }

  async function uploadPhotos(): Promise<Result<UploadedPhoto[]>> {
    const userId = session?.user.id;
    if (!userId) return { ok: false, error: { code: 'AUTH_REQUIRED', message: 'signed out' } };
    return photos.upload(userId, (n, total) =>
      setBusyLabel(f(s.attach.uploading, { n: String(n), total: String(total) })),
    );
  }

  function submitDecline() {
    if (text.trim().length < REASON_MIN)
      return setFieldError(f(s.work.reasonShort, { n: String(REASON_MIN) }));
    setFieldError(undefined);
    void act(() => svc().work.decline(item.issueId, version, text), s.work.declined);
  }

  function submitProgress() {
    if (!text.trim() && photos.photos.length === 0) return setError(s.work.noteOrPhoto);
    void act(async () => {
      const up = await uploadPhotos();
      if (!up.ok) return up;
      return svc().work.addProgress(item.issueId, text, up.value);
    }, s.work.progressPosted);
  }

  function submitResolve() {
    if (photos.photos.length === 0) return setError(s.work.needPhoto);
    void act(async () => {
      const up = await uploadPhotos();
      if (!up.ok) return up;
      return svc().work.resolve(item.issueId, version, text, up.value);
    }, s.work.resolved);
  }

  return (
    <Card>
      <Text style={styles.heading}>{s.work.panelTitle}</Text>
      {item.note ? <Body>{f(s.work.instruction, { note: item.note })}</Body> : null}
      {!item.assignedToMe ? (
        <Body muted>
          {f(s.work.department, { department: item.departmentName })} · {s.work.forDepartment}
        </Body>
      ) : null}
      {item.latitude !== null && item.longitude !== null ? (
        <Button
          variant="link"
          label={s.work.openMaps}
          onPress={() => void Linking.openURL(mapsUrl(item.latitude ?? 0, item.longitude ?? 0))}
        />
      ) : null}
      {done ? <Notice tone="info">{done}</Notice> : null}
      {item.status === 'RESOLVED' && !done ? <Body muted>{s.work.waiting}</Body> : null}
      {error ? <Notice tone="error">{error}</Notice> : null}

      {mode === 'idle' ? (
        <View style={styles.actions}>
          {steps.includes('accept') ? (
            <Button
              label={s.work.accept}
              busy={busy}
              onPress={() => void act(() => svc().work.accept(item.issueId), s.work.accepted)}
            />
          ) : null}
          {steps.includes('start') ? (
            <Button
              variant={steps.includes('accept') ? 'secondary' : 'primary'}
              label={s.work.start}
              busy={busy}
              onPress={() =>
                void act(() => svc().work.start(item.issueId, version), s.work.started)
              }
            />
          ) : null}
          {steps.includes('resolve') ? (
            <Button label={s.work.resolve} onPress={() => open('resolve')} />
          ) : null}
          {steps.includes('progress') ? (
            <Button
              variant="secondary"
              label={s.work.addProgress}
              onPress={() => open('progress')}
            />
          ) : null}
          {steps.includes('decline') ? (
            <Button variant="link" label={s.work.decline} onPress={() => open('decline')} />
          ) : null}
        </View>
      ) : null}

      {mode === 'decline' ? (
        <View style={styles.form}>
          <Text style={styles.formTitle}>{s.work.declineTitle}</Text>
          <TextField
            label={s.work.declineReason}
            placeholder={s.work.declinePlaceholder}
            value={text}
            onChangeText={setText}
            maxLength={REASON_MAX}
            multiline
            error={fieldError}
          />
          <Button label={s.work.declineSend} busy={busy} onPress={submitDecline} />
          <Button variant="link" label={s.common.cancel} onPress={() => open('idle')} />
        </View>
      ) : null}

      {mode === 'progress' || mode === 'resolve' ? (
        <View style={styles.form}>
          <Text style={styles.formTitle}>
            {mode === 'progress' ? s.work.progressTitle : s.work.resolveTitle}
          </Text>
          {mode === 'resolve' ? <Body muted>{s.work.resolveHint}</Body> : null}
          <TextField
            label={mode === 'progress' ? s.work.progressNote : s.work.resolveNote}
            placeholder={
              mode === 'progress' ? s.work.progressPlaceholder : s.work.resolvePlaceholder
            }
            value={text}
            onChangeText={setText}
            maxLength={PROGRESS_NOTE_MAX}
            multiline
          />
          <PhotoAttacher photos={photos} busy={busy} onError={setError} />
          <Button
            label={mode === 'progress' ? s.work.progressSend : s.work.resolveSend}
            busy={busy}
            {...(busyLabel ? { busyLabel } : {})}
            onPress={mode === 'progress' ? submitProgress : submitResolve}
          />
          <Button
            variant="link"
            label={s.common.cancel}
            disabled={busy}
            onPress={() => open('idle')}
          />
        </View>
      ) : null}
    </Card>
  );
}

/** Opens Google Maps (app or browser) on any phone; no extra library needed. */
export const mapsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/** The panel only renders when the app is configured, so services is set here. */
function svc() {
  if (!services) throw new Error('not configured');
  return services;
}

const styles = StyleSheet.create({
  heading: { fontSize: 18, fontWeight: '600', color: colors.text },
  actions: { gap: space.sm },
  form: { gap: space.sm },
  formTitle: { fontSize: 16, fontWeight: '600', color: colors.text },
});
