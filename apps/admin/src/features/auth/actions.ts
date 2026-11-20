'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { getServerServices } from '@/lib/supabase/server';
import { getStaffState, VILLAGE_COOKIE } from './staff-context';

export async function signOutAction(): Promise<void> {
  const services = await getServerServices();
  await services.auth.signOut();
  (await cookies()).delete(VILLAGE_COOKIE);
  redirect('/login');
}

const villageForm = z.object({ villageId: z.uuid() });

/** Switch the village being administered. Only villages the user administers are accepted. */
export async function selectVillageAction(formData: FormData): Promise<void> {
  const parsed = villageForm.safeParse({ villageId: formData.get('villageId') });
  const state = await getStaffState();
  if (!parsed.success || state.kind !== 'ready') redirect('/');
  if (!state.ctx.villages.some((v) => v.id === parsed.data.villageId)) redirect('/');
  (await cookies()).set(VILLAGE_COOKIE, parsed.data.villageId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  });
  redirect('/');
}
