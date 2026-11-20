import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthShell } from '@/components/ui/card';
import { SignOutButton } from '@/features/auth/sign-out-button';
import { getStaffState } from '@/features/auth/staff-context';

export const metadata: Metadata = { title: 'No access' };

export default async function NoAccessPage() {
  const state = await getStaffState();
  if (state.kind === 'signed_out') redirect('/login');
  if (state.kind === 'ready') redirect('/');
  if (state.kind === 'needs_security_code') redirect('/login/security-code');
  return (
    <AuthShell title="No admin access" subtitle="This account cannot use the admin website.">
      <p className="text-sm text-neutral-700">
        The admin website is for the President, Vice-President and EO / Secretary. Residents and
        workers use the Mana Village mobile app. If you think this is a mistake, ask your Panchayat
        to check your role, or check that your account is active.
      </p>
      <div className="mt-6">
        <SignOutButton />
      </div>
    </AuthShell>
  );
}
