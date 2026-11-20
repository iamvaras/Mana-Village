import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppError } from '@mana/core';
import type { MyProfile } from '@mana/services';
import { services, supabase } from '@/lib/supabase';
import { useI18n } from '@/i18n/i18n-provider';

/**
 * Where the signed-in person is in the sign-in flow. The root layout uses this to
 * choose which screens are reachable. The database still checks every action.
 */
export type AuthStage =
  | { kind: 'starting' }
  | { kind: 'signed_out' }
  | { kind: 'loading_profile' }
  | { kind: 'profile_error'; error: AppError }
  | { kind: 'needs_profile' }
  | { kind: 'suspended' }
  | { kind: 'ready'; profile: MyProfile };

interface SessionValue {
  session: Session | null;
  stage: AuthStage;
  retryProfile(): void;
}

const SessionContext = createContext<SessionValue | null>(null);

export const profileQueryKey = (userId: string | undefined) => ['profile', userId] as const;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [started, setStarted] = useState(false);
  const queryClient = useQueryClient();
  const { setLanguage } = useI18n();

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setStarted(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') queryClient.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id;
  const profileQuery = useQuery({
    queryKey: profileQueryKey(userId),
    enabled: Boolean(userId && services),
    queryFn: async () => {
      if (!services) throw new Error('not configured');
      const res = await services.profile.getMyProfile();
      if (!res.ok) throw res.error;
      return res.value;
    },
    retry: (count, error) => (error as Partial<AppError>).code === 'NETWORK' && count < 2,
  });

  // A revoked or expired session cannot be repaired here: sign out and start again.
  const profileErrorCode = (profileQuery.error as Partial<AppError> | null)?.code;
  useEffect(() => {
    if (profileErrorCode === 'AUTH_REQUIRED') void supabase?.auth.signOut();
  }, [profileErrorCode]);

  const profileLanguage = profileQuery.data?.preferred_language;
  useEffect(() => {
    if (profileLanguage) setLanguage(profileLanguage);
  }, [profileLanguage, setLanguage]);

  const stage = useMemo<AuthStage>(() => {
    if (!started) return { kind: 'starting' };
    if (!session) return { kind: 'signed_out' };
    if (profileQuery.isPending) return { kind: 'loading_profile' };
    if (profileQuery.isError) {
      const e = profileQuery.error as Partial<AppError>;
      return {
        kind: 'profile_error',
        error: { code: e.code ?? 'UNKNOWN', message: e.message ?? '' },
      };
    }
    const profile = profileQuery.data;
    if (!profile) return { kind: 'needs_profile' };
    if (profile.status !== 'ACTIVE') return { kind: 'suspended' };
    return { kind: 'ready', profile };
  }, [
    started,
    session,
    profileQuery.isPending,
    profileQuery.isError,
    profileQuery.error,
    profileQuery.data,
  ]);

  const value = useMemo<SessionValue>(
    () => ({ session, stage, retryProfile: () => void profileQuery.refetch() }),
    [session, stage, profileQuery],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/** The profile on screens that are only reachable once sign-in is complete. */
export function useReadyProfile(): MyProfile {
  const { stage } = useSession();
  if (stage.kind !== 'ready') throw new Error('profile not ready');
  return stage.profile;
}
