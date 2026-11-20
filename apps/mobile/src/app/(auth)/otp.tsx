import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { formatIndianPhone, normalizeIndianPhone } from '@mana/core';
import { Body, Button, Notice, Screen, TextField, Title } from '@/components/ui';
import { useI18n } from '@/i18n/i18n-provider';
import { services } from '@/lib/supabase';

export default function OtpScreen() {
  const { s, f, errorText } = useI18n();
  const params = useLocalSearchParams<{ phone?: string }>();
  const phone = normalizeIndianPhone(params.phone ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();

  if (!phone) {
    router.replace('/');
    return null;
  }

  async function verify() {
    if (!services || !phone) return;
    setCodeError(undefined);
    setFormError(undefined);
    setInfo(undefined);
    if (!/^\d{6}$/.test(code)) return setCodeError(s.otp.invalidCode);
    setBusy(true);
    const res = await services.auth.verifyOtp(phone, code);
    setBusy(false);
    if (!res.ok) {
      if (res.error.fields?.['code']) setCodeError(s.otp.wrongCode);
      else setFormError(errorText(res.error));
    }
    // On success the session changes and the root layout moves to the next screen.
  }

  async function resend() {
    if (!services || !phone) return;
    setFormError(undefined);
    const res = await services.auth.sendOtp(phone);
    if (res.ok) setInfo(s.otp.resent);
    else setFormError(errorText(res.error));
  }

  return (
    <Screen>
      <Title>{s.otp.title}</Title>
      <Body muted>{f(s.otp.sentTo, { phone: formatIndianPhone(phone) })}</Body>
      {info ? <Notice tone="info">{info}</Notice> : null}
      {formError ? <Notice tone="error">{formError}</Notice> : null}
      <TextField
        label={s.otp.codeLabel}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={6}
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
        error={codeError}
        onSubmitEditing={() => void verify()}
        autoFocus
      />
      <Button
        label={s.otp.verify}
        busyLabel={s.common.pleaseWait}
        busy={busy}
        onPress={() => void verify()}
      />
      <Button variant="link" label={s.otp.resend} disabled={busy} onPress={() => void resend()} />
      <Button
        variant="link"
        label={s.otp.changeNumber}
        disabled={busy}
        onPress={() => router.back()}
      />
    </Screen>
  );
}
