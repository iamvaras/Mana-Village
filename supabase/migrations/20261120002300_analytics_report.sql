-- =============================================================================
-- Phase 11 (part 2): Analytics page (docs/ui-ux.md admin 12, permission analytics.view).
-- Definitions approved by the user 2026-11-20 (docs/api.md §2):
--   Trend          = per week (per month when the range is longer than 120 days):
--                    issues reported that period, and issues closed that period.
--   Time to fix    = closed issues, report -> final RESOLVED, grouped
--                    <1 day, 1-3, 3-7, 7-30, >30 days.
--   Reopened rate  = issues ever marked solved that were reopened at least once
--                    (resident said "not solved", or staff reopened it).
-- Every figure covers issues reported in the range; trend "closed" counts
-- closings that happened in the range.
-- =============================================================================

create or replace function public.analytics_report(
  p_village_id uuid,
  p_from timestamptz default null,
  p_to   timestamptz default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_to timestamptz := coalesce(p_to, now());
  v_from timestamptz;
  v_bucket text;
  v_trend jsonb;
  v_fix jsonb;
  v_reopen jsonb;
begin
  perform private.require_user();
  perform private.require_permission(p_village_id, 'analytics.view');

  v_from := coalesce(p_from,
                     (select min(created_at) from public.issues where village_id = p_village_id),
                     v_to - interval '30 days');
  if v_from >= v_to then
    perform private.raise_app_error('MV_VALIDATION', 'the start date must be before the end date');
  end if;
  v_bucket := case when v_to - v_from > interval '120 days' then 'month' else 'week' end;

  with periods as (
    select g as period_start
      from generate_series(date_trunc(v_bucket, v_from, 'Asia/Kolkata'),
                           v_to, ('1 ' || v_bucket)::interval) g
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'period_start', p.period_start,
           'reported', (select count(*) from public.issues i
                         where i.village_id = p_village_id
                           and i.created_at >= greatest(p.period_start, v_from)
                           and i.created_at < least(p.period_start + ('1 ' || v_bucket)::interval, v_to)),
           'closed',   (select count(*) from public.issues i
                         where i.village_id = p_village_id and i.status = 'CLOSED'
                           and i.closed_at >= greatest(p.period_start, v_from)
                           and i.closed_at < least(p.period_start + ('1 ' || v_bucket)::interval, v_to))
         ) order by p.period_start), '[]'::jsonb)
    into v_trend
    from periods p;

  with scoped as (
    select * from public.issues i
     where i.village_id = p_village_id and i.created_at >= v_from and i.created_at < v_to
  ), fixed as (
    select extract(epoch from (resolved_at - created_at)) / 86400 as days
      from scoped where status = 'CLOSED' and resolved_at is not null
  )
  select jsonb_build_object(
           'under_1_day', count(*) filter (where days < 1),
           'days_1_3',    count(*) filter (where days >= 1 and days < 3),
           'days_3_7',    count(*) filter (where days >= 3 and days < 7),
           'days_7_30',   count(*) filter (where days >= 7 and days < 30),
           'over_30_days', count(*) filter (where days >= 30))
    into v_fix
    from fixed;

  select jsonb_build_object(
           'ever_resolved', count(*) filter (where resolved_at is not null),
           'reopened',      count(*) filter (where resolved_at is not null and reopen_count > 0),
           'rate', case when count(*) filter (where resolved_at is not null) = 0 then null
                        else round(count(*) filter (where resolved_at is not null and reopen_count > 0)::numeric
                                   / count(*) filter (where resolved_at is not null), 4) end)
    into v_reopen
    from public.issues i
   where i.village_id = p_village_id and i.created_at >= v_from and i.created_at < v_to;

  return jsonb_build_object(
    'from', v_from, 'to', v_to, 'bucket', v_bucket,
    'trend', v_trend, 'fix_time', v_fix, 'reopened', v_reopen);
end;
$$;

revoke all on function public.analytics_report(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.analytics_report(uuid, timestamptz, timestamptz) to authenticated;
