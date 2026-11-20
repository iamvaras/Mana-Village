import { useState } from 'react';
import { Body, Button, Notice, TextField } from '@/components/ui';
import { LIMITS } from '@mana/core';
import { getCurrentFix } from '@/features/report/location';
import { useReport } from '@/features/report/report-context';
import { StepFrame } from '@/features/report/step-frame';
import { useI18n } from '@/i18n/i18n-provider';

export default function LocationStep() {
  const { s, f } = useI18n();
  const { draft, update } = useReport();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function locate() {
    setError(null);
    setBusy(true);
    const res = await getCurrentFix();
    setBusy(false);
    if (res.kind === 'found') void update({ gps: res.fix });
    else
      setError(
        res.kind === 'permission_denied'
          ? s.report.locationDenied
          : res.kind === 'services_off'
            ? s.report.locationOff
            : s.report.locationFailed,
      );
  }

  return (
    <StepFrame step="location" title={s.report.locationTitle}>
      <Body muted>{s.report.locationHint}</Body>
      {draft.gps ? (
        <Notice tone="info">
          {draft.gps.accuracyM !== null
            ? f(s.report.locationFound, { m: String(draft.gps.accuracyM) })
            : s.report.locationFoundNoAccuracy}
        </Notice>
      ) : null}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        variant={draft.gps ? 'secondary' : 'primary'}
        label={draft.gps ? s.report.retryLocation : s.report.useLocation}
        busy={busy}
        busyLabel={s.report.findingLocation}
        onPress={() => void locate()}
      />
      {draft.gps ? (
        <Button
          variant="link"
          label={s.report.clearLocation}
          onPress={() => void update({ gps: null })}
        />
      ) : null}
      <TextField
        label={s.report.landmarkLabel}
        placeholder={s.report.landmarkPlaceholder}
        value={draft.landmark}
        onChangeText={(t) => void update({ landmark: t })}
        maxLength={LIMITS.locationTextMax}
      />
    </StepFrame>
  );
}
