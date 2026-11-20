-- =============================================================================
-- Mana Village: foundation
-- Schemas, extensions and enums.
--
-- Conventions (apply to every future migration):
--   * Forward-only. Never DROP tables/columns that hold data; never remove enum values.
--   * Every new table: enable RLS, revoke default grants, add explicit grants + policies.
--   * Every new function: SET search_path = '', schema-qualify names,
--     REVOKE EXECUTE FROM PUBLIC/anon, grant only what is needed.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- Helper functions that must not be exposed through the REST API live in `private`.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.issue_status as enum (
  'SUBMITTED', 'UNDER_REVIEW', 'VERIFIED', 'ASSIGNED', 'IN_PROGRESS',
  'RESOLVED', 'CLOSED', 'REJECTED', 'REOPENED', 'DUPLICATE'
);
create type public.issue_priority     as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
create type public.issue_visibility   as enum ('PUBLIC', 'PRIVATE');
create type public.content_visibility as enum ('PUBLIC', 'INTERNAL');
create type public.attachment_kind    as enum ('INITIAL_EVIDENCE', 'PROGRESS', 'COMPLETION', 'OTHER');
create type public.assignment_status  as enum ('PENDING', 'ACCEPTED', 'DECLINED', 'SUPERSEDED', 'COMPLETED');
create type public.user_status        as enum ('ACTIVE', 'SUSPENDED', 'DELETED');
create type public.announcement_status as enum ('DRAFT', 'PUBLISHED', 'ARCHIVED');
create type public.push_status        as enum ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
create type public.action_source      as enum ('MOBILE', 'ADMIN_WEB', 'SYSTEM');
create type public.role_scope         as enum ('VILLAGE', 'GLOBAL');

-- Generic updated_at maintenance.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Standard error raising. Clients map the prefix to an AppError code
-- (packages/core/src/errors). Codes: MV_AUTH_REQUIRED, MV_FORBIDDEN, MV_NOT_FOUND,
-- MV_VALIDATION, MV_INVALID_TRANSITION, MV_CONFLICT, MV_RATE_LIMIT.
create or replace function private.raise_app_error(p_code text, p_message text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = case p_code
                when 'MV_FORBIDDEN' then '42501'
                when 'MV_AUTH_REQUIRED' then '42501'
                else 'P0001'
              end,
    message = p_code || ': ' || p_message;
end;
$$;
