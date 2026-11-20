-- =============================================================================
-- Storage: private bucket for issue photos. See docs/security.md §4.
--
-- Upload path: issue-attachments/{auth.uid()}/{attachment_id}.{jpg|jpeg|png|webp}
-- A photo becomes part of an issue only when a workflow function registers it
-- (private.register_attachments). Reading requires permission to view the issue.
-- No client updates (overwrite) or deletes.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('issue-attachments', 'issue-attachments', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.users where id = (select auth.uid()) and status = 'ACTIVE');
$$;

create or replace function private.can_read_attachment_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.issue_attachments a
    join public.issues i on i.id = a.issue_id
    where a.storage_path = p_name
      and private.can_view_issue(a.issue_id)
      and (a.visibility = 'PUBLIC' or private.can_view_internal(a.issue_id))
      and (not a.is_hidden or private.is_village_staff(i.village_id))
  );
$$;

revoke all on function private.is_active_user(), private.can_read_attachment_object(text) from public, anon;
grant execute on function private.is_active_user(), private.can_read_attachment_object(text) to authenticated;

create policy "issue photos: upload to own folder"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'issue-attachments'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and name ~* '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  and (select private.is_active_user())
);

create policy "issue photos: read own uploads or visible issue photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'issue-attachments'
  and (
    owner_id = (select auth.uid())::text
    or (select private.can_read_attachment_object(name))
  )
);
