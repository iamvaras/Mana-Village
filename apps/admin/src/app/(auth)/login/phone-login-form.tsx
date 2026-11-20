'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { formatIndianPhone } from '@mana/core';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { getBrowserServices } from '@/lib/supabase/browser';

type Step = { kind: 'phone' } | { kind: 'code'; phone: string };

export function PhoneLoginForm() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'phone' });
  const [phoneInput, setPhoneInput] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | undefined>();
  const [info, setInfo] = useState<string | undefined>();

  function resetMessages() {
    setFieldError(undefined);
    setFormError(undefined);
    setInfo(undefined);
  }

  async function sendCode(e?: FormEvent) {
    e?.preventDefault();
    resetMessages();
    setBusy(true);
    const res = await getBrowserServices().auth.sendOtp(phoneInput);
    setBusy(false);
    if (!res.ok) {
      if (res.error.fields?.['phone']) setFieldError(res.error.fields['phone']);
      else setFormError(res.error.message);
      return;
    }
    setCode('');
    setStep({ kind: 'code', phone: res.value.phone });
    setInfo(`Code sent to ${formatIndianPhone(res.value.phone)}.`);
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    if (step.kind !== 'code') return;
    resetMessages();
    setBusy(true);
    const res = await getBrowserServices().auth.verifyOtp(step.phone, code.trim());
    if (!res.ok) {
      setBusy(false);
      if (res.error.fields?.['code']) setFieldError(res.error.fields['code']);
      else setFormError(res.error.message);
      return;
    }
    // The server decides where to go next (security code, no access, or dashboard).
    router.replace('/');
    router.refresh();
  }

  if (step.kind === 'phone') {
    return (
      <form onSubmit={sendCode} className="flex flex-col gap-4" noValidate>
        {formError ? <Alert tone="error">{formError}</Alert> : null}
        <Field
          id="phone"
          label="Mobile number"
          prefix="+91"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          placeholder="98765 43210"
          maxLength={14}
          value={phoneInput}
          onChange={(e) => setPhoneInput(e.target.value)}
          error={fieldError}
          required
          autoFocus
        />
        <Button type="submit" busy={busy}>
          Send code
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} className="flex flex-col gap-4" noValidate>
      {info ? <Alert tone="info">{info}</Alert> : null}
      {formError ? <Alert tone="error">{formError}</Alert> : null}
      <Field
        id="code"
        label="6-digit code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
        error={fieldError}
        required
        autoFocus
      />
      <Button type="submit" busy={busy}>
        Verify and sign in
      </Button>
      <div className="flex justify-between text-sm">
        <button
          type="button"
          className="text-neutral-600 underline-offset-2 hover:underline"
          onClick={() => {
            resetMessages();
            setStep({ kind: 'phone' });
          }}
        >
          Change number
        </button>
        <button
          type="button"
          className="text-brand-700 underline-offset-2 hover:underline disabled:text-neutral-400"
          disabled={busy}
          onClick={() => void sendCode()}
        >
          Resend code
        </button>
      </div>
    </form>
  );
}
