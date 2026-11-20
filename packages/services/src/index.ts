import type { ManaClient } from './client';
import { createAdminService } from './admin';
import { createAnalyticsService } from './analytics';
import { createAuthService } from './auth';
import { createDepartmentsService } from './departments';
import { createMfaService } from './mfa';
import { createPermissionsService } from './permissions';
import { createIssueListService } from './issue-list';
import { createIssueReadsService } from './issue-reads';
import { createIssuesService } from './issues';
import { createNotificationsService } from './notifications';
import { createProfileService } from './profile';
import { createVillagesService } from './villages';
import { createWorkflowService } from './workflow';

export type { ManaClient } from './client';
export * from './errors';
export * from './auth';
export * from './mfa';
export * from './profile';
export * from './permissions';
export * from './villages';
export * from './admin';
export * from './issues';
export * from './issue-reads';
export * from './notifications';
export * from './analytics';
export * from './issue-list';
export * from './workflow';
export * from './departments';

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
    issueReads: createIssueReadsService(client),
    notifications: createNotificationsService(client),
    analytics: createAnalyticsService(client),
    issueList: createIssueListService(client),
    workflow: createWorkflowService(client),
    departments: createDepartmentsService(client),
  };
}
export type Services = ReturnType<typeof createServices>;
