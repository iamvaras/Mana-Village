import { ok, type Result } from '@mana/core';
import type { ManaClient } from './client';
import { required, run } from './errors';

export interface Village {
  id: string;
  code: string;
  name: string;
  nameLocal: string | null;
  mandal: string | null;
  district: string | null;
}

export interface VillagesService {
  listActive(): Promise<Result<Village[]>>;
}

export function createVillagesService(client: ManaClient): VillagesService {
  return {
    async listActive() {
      const res = required(
        await run(() =>
          client
            .from('villages')
            .select('id, code, name, name_local, mandal, district')
            .eq('is_active', true)
            .order('name'),
        ),
      );
      if (!res.ok) return res;
      return ok(
        res.value.map((v) => ({
          id: v.id,
          code: v.code,
          name: v.name,
          nameLocal: v.name_local,
          mandal: v.mandal,
          district: v.district,
        })),
      );
    },
  };
}
