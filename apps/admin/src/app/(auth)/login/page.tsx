import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/ui/card';
import { getStaffState } from '@/features/auth/staff-context';
import { PhoneLoginForm } from './phone-login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage() {
  const state = await getStaffState();
  if (state.kind === 'ready') redirect('/');
  if (state.kind === 'needs_security_code') redirect('/login/security-code');
  if (state.kind === 'not_staff') redirect('/no-access');
  return (
    <AuthShell
      title="Sign in"
      subtitle="For Panchayat staff. We will send a code to your mobile number."
    >
      <PhoneLoginForm />
    </AuthShell>
  );
}
