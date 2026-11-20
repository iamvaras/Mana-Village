import { z } from 'zod';
import {
  LANGUAGES,
  ROLE_KEYS,
  USER_STATUSES,
  err,
  ok,
  profileSchema,
  type Language,
  type Result,
} from '@mana/core';
import type { ManaClient } from './client';
import { run, toAppError, validationError } from './errors';

const profileRowSchema = z.object({
  id: z.uuid(),
  full_name: z.string(),
  display_name: z.string().nullable(),
  home_village_id: z.uuid().nullable(),
  preferred_language: z.enum(LANGUAGES),
  status: z.enum(USER_STATUSES),
  phone: z.string().nullable(),
  roles: z.array(
    z.object({
      role: z.enum(ROLE_KEYS),
      village_id: z.uuid().nullable(),
      department_id: z.uuid().nullable(),
    }),
  ),
});
export type MyProfile = z.infer<typeof profileRowSchema>;

export interface ProfileInput {
  fullName: string;
  displayName?: string;
  homeVillageId: string;
  preferredLanguage: Language;
}

export interface ProfileService {
  /** `null` when the user signed in but has not completed their profile yet. */
  getMyProfile(): Promise<Result<MyProfile | null>>;
  completeProfile(input: ProfileInput): Promise<Result<null>>;
  changeHomeVillage(villageId: string): Promise<Result<null>>;
}

export function createProfileService(client: ManaClient): ProfileService {
  return {
    async getMyProfile() {
      const res = await run(() => client.rpc('get_my_profile'));
      if (!res.ok) return res;
      if (res.value === null) return ok(null);
      const parsed = profileRowSchema.safeParse(res.value);
      if (!parsed.success) return err(toAppError({ message: 'unexpected profile shape' }));
      return ok(parsed.data);
    },

    async completeProfile(input) {
      const parsed = profileSchema.safeParse(input);
      if (!parsed.success) {
        const fields: Record<string, string> = {};
        for (const issue of parsed.error.issues)
          fields[String(issue.path[0] ?? 'form')] = issue.message;
        return validationError(fields);
      }
      const v = parsed.data;
      const res = await run(() =>
        client.rpc('complete_profile', {
          p_full_name: v.fullName,
          p_home_village_id: v.homeVillageId,
          p_preferred_language: v.preferredLanguage,
          ...(v.displayName ? { p_display_name: v.displayName } : {}),
        }),
      );
      return res.ok ? ok(null) : res;
    },

    async changeHomeVillage(villageId) {
      const res = await run(() => client.rpc('change_home_village', { p_village_id: villageId }));
      return res.ok ? ok(null) : res;
    },
  };
}
