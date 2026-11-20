-- =============================================================================
-- Dashboard and analytics (read-only, permission analytics.view).
-- Definitions (approved 2026-11-20, docs/api.md §2):
--   Open             = status not in (CLOSED, REJECTED, DUPLICATE)
--   Resolution rate  = CLOSED / (all - REJECTED - DUPLICATE)
--   Avg resolution   = created_at → resolved_at, over CLOSED issues
-- =============================================================================

create or replace function public.dashboard_stats(
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
  v_result jsonb;
begin
  perform private.require_user();
  perform private.require_permission(p_village_id, 'analytics.view');

  with scoped as (
    select * from public.issues i
    where i.village_id = p_village_id
      and (p_from is null or i.created_at >= p_from)
      and (p_to is null or i.created_at < p_to)
  )
  select jsonb_build_object(
    'total',            count(*),
    'open',             count(*) filter (where status not in ('CLOSED', 'REJECTED', 'DUPLICATE')),
    'submitted',        count(*) filter (where status = 'SUBMITTED'),
    'under_review',     count(*) filter (where status = 'UNDER_REVIEW'),
    'verified',         count(*) filter (where status = 'VERIFIED'),
    'assigned',         count(*) filter (where status = 'ASSIGNED'),
    'in_progress',      count(*) filter (where status = 'IN_PROGRESS'),
    'resolved',         count(*) filter (where status = 'RESOLVED'),
    'closed',           count(*) filter (where status = 'CLOSED'),
    'reopened',         count(*) filter (where status = 'REOPENED'),
    'rejected',         count(*) filter (where status = 'REJECTED'),
    'duplicate',        count(*) filter (where status = 'DUPLICATE'),
    'critical_open',    count(*) filter (where priority = 'CRITICAL' and status not in ('CLOSED', 'REJECTED', 'DUPLICATE')),
    'awaiting_review',  count(*) filter (where status in ('SUBMITTED', 'UNDER_REVIEW')),
    'awaiting_citizen', count(*) filter (where status = 'RESOLVED'),
    'resolution_rate',  case when count(*) filter (where status not in ('REJECTED', 'DUPLICATE')) = 0 then null
                             else round(count(*) filter (where status = 'CLOSED')::numeric
                                        / count(*) filter (where status not in ('REJECTED', 'DUPLICATE')), 4) end,
    'avg_resolution_hours', round((extract(epoch from avg(resolved_at - created_at) filter (where status = 'CLOSED')) / 3600)::numeric, 1)
  ) into v_result
  from scoped;
  return v_result;
end;
$$;

create or replace function public.issues_by_category(
  p_village_id uuid, p_from timestamptz default null, p_to timestamptz default null
)
returns table (category_id uuid, category_key text, category_name text, total bigint, open bigint, closed bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  perform private.require_permission(p_village_id, 'analytics.view');
  return query
    select c.id, c.key, c.name,
           count(i.id),
           count(i.id) filter (where i.status not in ('CLOSED', 'REJECTED', 'DUPLICATE')),
           count(i.id) filter (where i.status = 'CLOSED')
    from public.issue_categories c
    left join public.issues i on i.category_id = c.id and i.village_id = p_village_id
      and (p_from is null or i.created_at >= p_from) and (p_to is null or i.created_at < p_to)
    group by c.id, c.key, c.name, c.sort_order
    order by c.sort_order;
end;
$$;

create or replace function public.issues_by_department(
  p_village_id uuid, p_from timestamptz default null, p_to timestamptz default null
)
returns table (department_id uuid, department_name text, total bigint, open bigint, closed bigint, avg_resolution_hours numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_user();
  perform private.require_permission(p_village_id, 'analytics.view');
  return query
    select d.id, d.name,
           count(i.id),
           count(i.id) filter (where i.status not in ('CLOSED', 'REJECTED', 'DUPLICATE')),
           count(i.id) filter (where i.status = 'CLOSED'),
           round((extract(epoch from avg(i.resolved_at - i.created_at) filter (where i.status = 'CLOSED')) / 3600)::numeric, 1)
    from public.departments d
    left join public.issues i on i.assigned_department_id = d.id
      and (p_from is null or i.created_at >= p_from) and (p_to is null or i.created_at < p_to)
    where d.village_id = p_village_id
    group by d.id, d.name
    order by d.name;
end;
$$;
