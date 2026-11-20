import type { ManaClient } from './client';
import { createAdminService } from './admin';
import { createAuthService } from './auth';
import { createMfaService } from './mfa';
import { createPermissionsService } from './permissions';
import { createIssuesService } from './issues';
import { createProfileService } from './profile';
import { createVillagesService } from './villages';

export type { ManaClient } from './client';
export * from './errors';
export * from './auth';
export * from './mfa';
export * from './profile';
export * from './permissions';
export * from './villages';
export * from './admin';
export * from './issues';

/** All services bound to one Supabase client. Components use hooks that call these. */
export function createServices(client: ManaClient) {
  return {
    auth: createAuthService(client),
    mfa: createMfaService(client),
    profile: createProfileService(client),
    permissions: createPermissionsService(client),
    villages: createVillagesService(client),
    admin: createAdminService(client),
    issues: createIssuesService(client),
  };
}
export type Services = ReturnType<typeof createServices>;
