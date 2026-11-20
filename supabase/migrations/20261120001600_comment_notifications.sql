-- =============================================================================
-- Phase 5: in-app notifications for comments.
-- Status changes already notify people inside the workflow functions. Comments
-- (including a worker's progress notes) now notify too, from a trigger, so every
-- way of adding a comment is covered.
--   PUBLIC comment   -> reporter + supporters, and the current assignee(s)
--   INTERNAL note    -> the current assignee(s) only (citizens never see notes)
-- The author is never notified about their own comment.
-- =============================================================================

create or replace function private.notification_title(p_type text, p_lang text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_lang = 'te' then case p_type
      when 'ISSUE_NEEDS_REVIEW'          then 'కొత్త సమస్య నమోదైంది'
      when 'ISSUE_UNDER_REVIEW'          then 'మీ సమస్యను పరిశీలిస్తున్నారు'
      when 'ISSUE_VERIFIED'              then 'సమస్య ధృవీకరించబడింది'
      when 'ISSUE_REJECTED'              then 'మీ సమస్య తిరస్కరించబడింది'
      when 'ISSUE_DUPLICATE'             then 'ఈ సమస్య ఇప్పటికే నమోదైంది'
      when 'ISSUE_ASSIGNED'              then 'పని అప్పగించబడింది'
      when 'WORK_ASSIGNED_TO_YOU'        then 'మీకు కొత్త పని అప్పగించబడింది'
      when 'ASSIGNMENT_DECLINED'         then 'పని తిరస్కరించబడింది'
      when 'WORK_STARTED'                then 'పని ప్రారంభమైంది'
      when 'RESOLUTION_CONFIRM_REQUEST'  then 'ఈ సమస్య నిజంగా పరిష్కరించబడిందా?'
      when 'RESOLUTION_REMINDER'         then 'గుర్తు: ఈ సమస్య పరిష్కరించబడిందా?'
      when 'ISSUE_CLOSED'                then 'సమస్య ముగించబడింది'
      when 'ISSUE_REOPENED'              then 'సమస్య మళ్లీ తెరవబడింది'
      when 'ISSUE_RECONSIDERED'          then 'సమస్యను మళ్లీ పరిశీలిస్తున్నారు'
      when 'NEW_COMMENT'                 then 'కొత్త వ్యాఖ్య'
      else 'మన విలేజ్ అప్‌డేట్'
    end
    else case p_type
      when 'ISSUE_NEEDS_REVIEW'          then 'New issue reported'
      when 'ISSUE_UNDER_REVIEW'          then 'Your issue is being checked'
      when 'ISSUE_VERIFIED'              then 'Issue verified'
      when 'ISSUE_REJECTED'              then 'Your issue was rejected'
      when 'ISSUE_DUPLICATE'             then 'This issue was already reported'
      when 'ISSUE_ASSIGNED'              then 'Work assigned'
      when 'WORK_ASSIGNED_TO_YOU'        then 'New work assigned to you'
      when 'ASSIGNMENT_DECLINED'         then 'Assignment declined'
      when 'WORK_STARTED'                then 'Work started'
      when 'RESOLUTION_CONFIRM_REQUEST'  then 'Was this problem actually solved?'
      when 'RESOLUTION_REMINDER'         then 'Reminder: was this problem solved?'
      when 'ISSUE_CLOSED'                then 'Issue closed'
      when 'ISSUE_REOPENED'              then 'Issue reopened'
      when 'ISSUE_RECONSIDERED'          then 'Issue is being reviewed again'
      when 'NEW_COMMENT'                 then 'New comment'
      else 'Mana Village update'
    end
  end;
$$;

create or replace function private.notify_on_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_hidden then
    return new;
  end if;
  if new.visibility = 'PUBLIC' then
    perform private.notify_followers(new.issue_id, 'NEW_COMMENT');
    -- Skip assignees already notified as followers (e.g. a worker who also supports the issue).
    perform private.notify(a.user_id, new.issue_id, 'NEW_COMMENT')
    from (
      select x.assignee_user_id as user_id
      from public.issue_assignments x
      where x.issue_id = new.issue_id and x.ended_at is null and x.assignee_user_id is not null
    ) a
    where a.user_id is distinct from new.author_id
      and a.user_id not in (select i.created_by from public.issues i where i.id = new.issue_id)
      and a.user_id not in (select s.user_id from public.issue_supporters s where s.issue_id = new.issue_id);
  else
    perform private.notify_assignees(new.issue_id, 'NEW_COMMENT');
  end if;
  return new;
end;
$$;

create trigger issue_comments_notify after insert on public.issue_comments
  for each row execute function private.notify_on_comment();

revoke all on function private.notify_on_comment() from public, anon, authenticated;
revoke all on function private.notification_title(text, text) from public, anon, authenticated;

-- Timeline order: assignment responses used the transaction start time (now()),
-- while history, comments and photos use the exact clock time. Stamp responses
-- with the exact time too, so "accepted" sorts correctly among other events.
create or replace function private.stamp_assignment_response()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.responded_at is not null and old.responded_at is null then
    new.responded_at := clock_timestamp();
  end if;
  return new;
end;
$$;

create trigger issue_assignments_response_time before update on public.issue_assignments
  for each row execute function private.stamp_assignment_response();

revoke all on function private.stamp_assignment_response() from public, anon, authenticated;
