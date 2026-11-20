import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { LanguageSwitch } from '@/components/language-switch';
import {
  Body,
  Button,
  CenteredState,
  Choice,
  Notice,
  Screen,
  TextField,
  Title,
} from '@/components/ui';
import { profileQueryKey, useSession } from '@/features/auth/session-provider';
import { useVillages, villageLabel } from '@/features/profile/use-villages';
import { useI18n } from '@/i18n/i18n-provider';
import { services } from '@/lib/supabase';

export default function ProfileSetupScreen() {
  const { s, language, errorText } = useI18n();
  const { session } = useSession();
  const queryClient = useQueryClient();
  const villages = useVillages();
  const [name, setName] = useState('');
  const [villageId, setVillageId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; village?: string; form?: string }>({});

  async function submit() {
    if (!services) return;
    const next: typeof errors = {};
    if (name.trim().length < 2) next.name = s.profileSetup.nameRequired;
    if (!villageId) next.village = s.profileSetup.villageRequired;
    setErrors(next);
    if (next.name || next.village || !villageId) return;
    setBusy(true);
    const res = await services.profile.completeProfile({
      fullName: name.trim(),
      homeVillageId: villageId,
      preferredLanguage: language,
    });
    if (!res.ok) {
      setBusy(false);
      setErrors({ form: errorText(res.error) });
      return;
    }
    await queryClient.invalidateQueries({ queryKey: profileQueryKey(session?.user.id) });
  }

  return (
    <Screen>
      <Title>{s.profileSetup.title}</Title>
      <Body muted>{s.profileSetup.subtitle}</Body>
      <LanguageSwitch />
      {errors.form ? <Notice tone="error">{errors.form}</Notice> : null}
      <TextField
        label={s.profileSetup.nameLabel}
        value={name}
        onChangeText={setName}
        autoComplete="name"
        textContentType="name"
        maxLength={80}
        error={errors.name}
      />
      <Body>{s.profileSetup.villageLabel}</Body>
      {villages.isPending ? (
        <CenteredState loading />
      ) : villages.isError ? (
        <>
          <Notice tone="error">{errorText(villages.error)}</Notice>
          <Button
            variant="secondary"
            label={s.common.retry}
            onPress={() => void villages.refetch()}
          />
        </>
      ) : villages.data.length === 0 ? (
        <Notice tone="info">{s.profileSetup.noVillages}</Notice>
      ) : (
        villages.data.map((v) => (
          <Choice
            key={v.id}
            label={villageLabel(v, language)}
            selected={villageId === v.id}
            onPress={() => setVillageId(v.id)}
          />
        ))
      )}
      {errors.village ? <Notice tone="error">{errors.village}</Notice> : null}
      <Button
        label={s.profileSetup.submit}
        busyLabel={s.common.pleaseWait}
        busy={busy}
        onPress={() => void submit()}
      />
    </Screen>
  );
}
