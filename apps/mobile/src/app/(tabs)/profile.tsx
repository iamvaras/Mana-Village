import { useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { formatIndianPhone, type Language } from '@mana/core';
import { LanguageSwitch } from '@/components/language-switch';
import { Body, Button, Card, Choice, Notice, Screen, TextField, Title } from '@/components/ui';
import { profileQueryKey, useReadyProfile } from '@/features/auth/session-provider';
import { useVillages, villageLabel } from '@/features/profile/use-villages';
import { registerForPush, signOutAndUnlinkPhone } from '@/features/push/push';
import { colors, space } from '@/components/theme';
import { useI18n } from '@/i18n/i18n-provider';
import { services } from '@/lib/supabase';

export default function ProfileScreen() {
  const { s, language, errorText } = useI18n();
  const profile = useReadyProfile();
  const queryClient = useQueryClient();
  const villages = useVillages();
  const [name, setName] = useState(profile.full_name);
  const [changingVillage, setChangingVillage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'error' | 'info'; text: string } | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: profileQueryKey(profile.id) });

  async function saveDetails(nextLanguage: Language = language) {
    if (!services || !profile.home_village_id) return;
    setBusy(true);
    setMessage(null);
    const res = await services.profile.completeProfile({
      fullName: name.trim(),
      homeVillageId: profile.home_village_id,
      preferredLanguage: nextLanguage,
    });
    setBusy(false);
    if (!res.ok) return setMessage({ tone: 'error', text: errorText(res.error) });
    setMessage({ tone: 'info', text: s.profile.saved });
    await refresh();
  }

  async function changeVillage(villageId: string) {
    if (!services || villageId === profile.home_village_id) return setChangingVillage(false);
    setBusy(true);
    setMessage(null);
    const res = await services.profile.changeHomeVillage(villageId);
    setBusy(false);
    if (!res.ok) return setMessage({ tone: 'error', text: errorText(res.error) });
    setChangingVillage(false);
    setMessage({ tone: 'info', text: s.profile.villageChanged });
    await refresh();
  }

  async function setPush(enabled: boolean) {
    if (!services) return;
    setBusy(true);
    setMessage(null);
    const res = await services.push.setEnabled(enabled);
    if (!res.ok) {
      setBusy(false);
      return setMessage({ tone: 'error', text: errorText(res.error) });
    }
    if (enabled) {
      const outcome = await registerForPush('always');
      if (outcome === 'denied') setMessage({ tone: 'info', text: s.profile.pushDenied });
      else if (outcome === 'not_configured' || outcome === 'unsupported')
        setMessage({ tone: 'info', text: s.profile.pushUnavailable });
    }
    setBusy(false);
    await refresh();
  }

  const current = villages.data?.find((v) => v.id === profile.home_village_id);

  return (
    <Screen>
      <Title>{s.profile.title}</Title>
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}

      <Card>
        <Body muted>{s.profile.phone}</Body>
        <Body>{profile.phone ? formatIndianPhone(profile.phone) : '—'}</Body>
        <Body muted>{s.profile.privacy}</Body>
      </Card>

      <TextField label={s.profile.editName} value={name} onChangeText={setName} maxLength={80} />
      <Button
        variant="secondary"
        label={s.common.save}
        busy={busy}
        disabled={name.trim().length < 2 || name.trim() === profile.full_name}
        onPress={() => void saveDetails()}
      />

      <Body>{s.language.label}</Body>
      {/* Saving the language keeps notifications in the chosen language too. */}
      <LanguageSwitch onChange={(l) => void saveDetails(l)} />

      <Card>
        <Body muted>{s.profile.village}</Body>
        <Body>{current ? villageLabel(current, language) : '—'}</Body>
        {changingVillage ? (
          (villages.data ?? []).map((v) => (
            <Choice
              key={v.id}
              label={villageLabel(v, language)}
              selected={v.id === profile.home_village_id}
              onPress={() => void changeVillage(v.id)}
            />
          ))
        ) : (
          <Button
            variant="link"
            label={s.profile.changeVillage}
            onPress={() => setChangingVillage(true)}
          />
        )}
      </Card>

      <Card>
        <View style={styles.switchRow}>
          <View style={styles.switchText}>
            <Body>{s.profile.pushLabel}</Body>
            <Body muted>{s.profile.pushHint}</Body>
          </View>
          <Switch
            value={profile.push_enabled}
            disabled={busy}
            onValueChange={(v) => void setPush(v)}
            accessibilityLabel={s.profile.pushLabel}
            trackColor={{ true: colors.brand, false: colors.border }}
          />
        </View>
      </Card>

      <Button
        variant="secondary"
        label={s.profile.signOut}
        onPress={() => void signOutAndUnlinkPhone()}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  switchText: { flex: 1, gap: 2 },
});
