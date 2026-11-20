-- =============================================================================
-- Function grants (explicit allow-list) and scheduled jobs.
-- New client-callable functions must be added to the GRANT list below in a new
-- migration; everything else stays uncallable by anon/authenticated.
-- =============================================================================

revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;

grant execute on function
  public.complete_profile(text, uuid, text, text),
  public.get_my_profile(),
  public.change_home_village(uuid),
  public.get_my_permissions(uuid),
  public.create_issue(uuid, uuid, text, uuid, text, text, numeric, numeric, numeric, public.issue_visibility, jsonb, text),
  public.edit_my_issue(uuid, int, text, text, text),
  public.find_similar_issues(uuid, uuid, numeric, numeric, int),
  public.support_issue(uuid),
  public.unsupport_issue(uuid),
  public.add_comment(uuid, text, public.content_visibility),
  public.add_issue_photos(uuid, public.attachment_kind, jsonb, public.content_visibility),
  public.register_push_token(text, text, text),
  public.revoke_push_token(text),
  public.mark_all_notifications_read(),
  public.start_review(uuid, int, text),
  public.verify_issue(uuid, int, public.issue_priority, text, text),
  public.reject_issue(uuid, int, text, text),
  public.mark_duplicate(uuid, int, uuid, text, text),
  public.reconsider_issue(uuid, int, text, text),
  public.assign_issue(uuid, int, uuid, uuid, text, timestamptz, text, text),
  public.accept_assignment(uuid),
  public.decline_assignment(uuid, int, text, text),
  public.start_work(uuid, int, text),
  public.add_progress_update(uuid, text, jsonb),
  public.resolve_issue(uuid, int, text, jsonb, text),
  public.confirm_resolution(uuid, int, boolean, text, jsonb, text),
  public.close_issue(uuid, int, text, text),
  public.reopen_issue(uuid, int, text, text),
  public.set_issue_priority(uuid, int, public.issue_priority),
  public.set_issue_visibility(uuid, int, public.issue_visibility),
  public.hide_comment(uuid, text),
  public.hide_attachment(uuid, text),
  public.dashboard_stats(uuid, timestamptz, timestamptz),
  public.issues_by_category(uuid, timestamptz, timestamptz),
  public.issues_by_department(uuid, timestamptz, timestamptz)
to authenticated;

-- Predicates used inside RLS / storage policies.
grant execute on function
  private.has_permission(uuid, text),
  private.is_assignee(uuid),
  private.can_view_issue(uuid),
  private.can_view_internal(uuid),
  private.is_village_staff(uuid),
  private.is_active_user(),
  private.can_read_attachment_object(text),
  -- used inside the read views (functions in views run with the caller's privileges)
  private.person_label(uuid, uuid),
  private.staff_role_key(uuid, uuid)
to authenticated;

-- Scheduled jobs (times in UTC). 10:00 IST = 04:30 UTC.
create extension if not exists pg_cron;
select cron.schedule('mana-auto-close-resolved', '17 * * * *', $$select private.auto_close_resolved()$$);
select cron.schedule('mana-resolution-reminders', '30 4 * * *', $$select private.send_resolution_reminders()$$);
