import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/ui/card';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { getStaffState } from '@/features/auth/staff-context';
import { SecurityCodeForm } from './security-code-form';

export const metadata: Metadata = { title: 'Security code' };

export default async function SecurityCodePage() {
  const state = await getStaffState();
  if (state.kind === 'signed_out') redirect('/login');
  if (state.kind === 'ready') redirect('/');
  if (state.kind === 'not_staff') redirect('/no-access');
  if (state.kind === 'error') throw new Error(state.message);
  return (
    <AuthShell
      title="Security code"
      subtitle="Admin accounts need a second step: a 6-digit code from an authenticator app on your phone."
    >
      <SecurityCodeForm />
      <div className="mt-6 border-t border-neutral-200 pt-4 text-center">
        <SignOutButton />
      </div>
    </AuthShell>
  );
}
