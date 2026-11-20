-- =============================================================================
-- Helpers callable ONLY by the service role (Edge Functions). Never granted to
-- anon or authenticated.
-- =============================================================================

-- Used by the invite-staff Edge Function to find an existing account by phone.
create or replace function public.service_find_user_by_phone(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users where phone = p_phone limit 1;
$$;

-- Creates the profile + CITIZEN role for an invited person who has never signed in.
create or replace function public.service_ensure_profile(p_user_id uuid, p_full_name text, p_village_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.users where id = p_user_id) then
    return;
  end if;
  insert into public.users (id, full_name, home_village_id) values (p_user_id, btrim(p_full_name), p_village_id);
  insert into public.user_roles (user_id, role_id, village_id)
  select p_user_id, r.id, p_village_id from public.roles r where r.key = 'CITIZEN';
end;
$$;

revoke execute on function public.service_find_user_by_phone(text), public.service_ensure_profile(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.service_find_user_by_phone(text), public.service_ensure_profile(uuid, text, uuid)
  to service_role;
