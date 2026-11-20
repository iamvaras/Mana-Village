import { useQuery } from '@tanstack/react-query';
import type { AppError, Language } from '@mana/core';
import type { Category } from '@mana/services';
import { services } from '@/lib/supabase';

export function useCategories() {
  return useQuery<Category[], AppError>({
    queryKey: ['categories'],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      if (!services) throw { code: 'UNKNOWN', message: 'not configured' } satisfies AppError;
      const res = await services.issues.listCategories();
      if (!res.ok) throw res.error;
      return res.value;
    },
  });
}

export function categoryName(c: Category, language: Language): string {
  return language === 'te' && c.nameLocal ? c.nameLocal : c.name;
}
