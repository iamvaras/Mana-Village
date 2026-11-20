import { useQuery } from '@tanstack/react-query';
import type { AppError } from '@mana/core';
import type { Village } from '@mana/services';
import { services } from '@/lib/supabase';

export function useVillages() {
  return useQuery<Village[], AppError>({
    queryKey: ['villages'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      if (!services) throw { code: 'UNKNOWN', message: 'not configured' } satisfies AppError;
      const res = await services.villages.listActive();
      if (!res.ok) throw res.error;
      return res.value;
    },
  });
}

export function villageLabel(v: Village, language: 'te' | 'en'): string {
  return language === 'te' && v.nameLocal ? `${v.nameLocal} (${v.name})` : v.name;
}
