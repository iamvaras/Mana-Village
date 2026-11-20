import { useState } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { router } from 'expo-router';
import { LanguageSwitch } from '@/components/language-switch';
import { Body, Button, Notice, Screen, TextField, Title } from '@/components/ui';
import { useI18n } from '@/i18n/i18n-provider';
import { services } from '@/lib/supabase';

export default function LoginScreen() {
  const { s, errorText } = useI18n();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [phoneError, setPhoneError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();

  async function sendCode() {
    if (!services) return;
    setPhoneError(undefined);
    setFormError(undefined);
    setBusy(true);
    const res = await services.auth.sendOtp(phone);
    setBusy(false);
    if (!res.ok) {
      if (res.error.fields?.['phone']) setPhoneError(s.login.invalidPhone);
      else setFormError(errorText(res.error));
      return;
    }
    router.push({ pathname: '/otp', params: { phone: res.value.phone } });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Screen>
        <LanguageSwitch />
        <Title>{s.common.appName}</Title>
        <Body muted>{s.login.subtitle}</Body>
        {formError ? <Notice tone="error">{formError}</Notice> : null}
        <TextField
          label={s.login.phoneLabel}
          prefix="+91"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          placeholder={s.login.phonePlaceholder}
          maxLength={14}
          value={phone}
          onChangeText={setPhone}
          error={phoneError}
          onSubmitEditing={() => void sendCode()}
          autoFocus
        />
        <Button
          label={s.login.sendCode}
          busyLabel={s.common.pleaseWait}
          busy={busy}
          onPress={() => void sendCode()}
        />
      </Screen>
    </KeyboardAvoidingView>
  );
}
