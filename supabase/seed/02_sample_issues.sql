-- =============================================================================
-- DEVELOPMENT / TEST SEED ONLY. Never run against production.
-- Sample issues for the admin dashboard and All Issues table (Phase 6).
--
-- Every issue is created and moved through its workflow with the real RPCs,
-- acting as the real seed users, so history rows, audit logs and notifications
-- are exactly what the app itself would produce. Photos are registered as
-- Storage metadata only (there is no image file behind them locally).
--
-- Expected dashboard numbers for Ramapuram (checked by
-- supabase/tests/database/08_dashboard.test.sql):
--   total 13 | open 9 | submitted 2 | under review 1 | verified 1 | assigned 1
--   in progress 2 | resolved 1 | closed 2 | reopened 1 | rejected 1 | duplicate 1
--   critical open 2 | awaiting review 3 | awaiting citizen 1 | resolution rate 2/11
-- Kondapalli has 1 submitted issue (proves numbers are per village).
-- =============================================================================

begin;

create function pg_temp.act_as(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', 'aal2')::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.done() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

create function pg_temp.u(p_n text) returns uuid language sql immutable as $$
  select ('b0000000-0000-4000-8000-0000000000' || p_n)::uuid $$;

-- Photo metadata as if p_uid had uploaded it. Leaves you as the database owner.
create function pg_temp.photo(p_uid uuid) returns jsonb language plpgsql as $$
declare v_id uuid := gen_random_uuid(); v_name text := p_uid || '/' || v_id || '.jpg';
begin
  perform pg_temp.done();
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('issue-attachments', v_name, p_uid::text, '{"mimetype": "image/jpeg", "size": 150000}');
  return jsonb_build_array(jsonb_build_object('id', v_id, 'path', v_name));
end $$;

create function pg_temp.ver(p_issue uuid) returns int language sql stable security definer as $$
  select version from public.issues where id = p_issue $$;

create function pg_temp.report(
  p_uid uuid, p_village uuid, p_category text, p_title text, p_description text, p_place text,
  p_lat numeric, p_lng numeric
) returns uuid language plpgsql as $$
declare
  v_category uuid := (select id from public.issue_categories where key = p_category);
  v_photos jsonb := case when p_category = 'OTHER' then '[]'::jsonb else pg_temp.photo(p_uid) end;
  v_res jsonb;
begin
  perform pg_temp.act_as(p_uid);
  v_res := public.create_issue(p_village, v_category, p_title, gen_random_uuid(), p_description, p_place,
                               p_lat, p_lng, 10, null, v_photos, 'MOBILE');
  perform pg_temp.done();
  return (v_res ->> 'id')::uuid;
end $$;

-- Secretary (Kiran) reviews, verifies with a priority and assigns.
create function pg_temp.review(p_issue uuid) returns void language plpgsql as $$
begin
  perform pg_temp.act_as(pg_temp.u('12'));
  perform public.start_review(p_issue, pg_temp.ver(p_issue));
  perform pg_temp.done();
end $$;

create function pg_temp.verify(p_issue uuid, p_priority public.issue_priority) returns void language plpgsql as $$
begin
  perform pg_temp.review(p_issue);
  perform pg_temp.act_as(pg_temp.u('12'));
  perform public.verify_issue(p_issue, pg_temp.ver(p_issue), p_priority, 'Checked by the secretary');
  perform pg_temp.done();
end $$;

create function pg_temp.assign(p_issue uuid, p_priority public.issue_priority, p_dept uuid, p_worker uuid) returns void
language plpgsql as $$
begin
  perform pg_temp.verify(p_issue, p_priority);
  perform pg_temp.act_as(pg_temp.u('12'));
  perform public.assign_issue(p_issue, pg_temp.ver(p_issue), p_dept, p_worker);
  perform pg_temp.done();
end $$;

-- The worker accepts and starts.
create function pg_temp.start(p_issue uuid, p_priority public.issue_priority, p_dept uuid, p_worker uuid) returns void
language plpgsql as $$
begin
  perform pg_temp.assign(p_issue, p_priority, p_dept, p_worker);
  perform pg_temp.act_as(p_worker);
  perform public.accept_assignment(p_issue);
  perform public.start_work(p_issue, pg_temp.ver(p_issue));
  perform pg_temp.done();
end $$;

create function pg_temp.resolve(p_issue uuid, p_worker uuid, p_note text) returns void language plpgsql as $$
declare v_photos jsonb := pg_temp.photo(p_worker);
begin
  perform pg_temp.act_as(p_worker);
  perform public.resolve_issue(p_issue, pg_temp.ver(p_issue), p_note, v_photos);
  perform pg_temp.done();
end $$;

create function pg_temp.confirm(p_issue uuid, p_reporter uuid, p_solved boolean, p_reason text default null) returns void
language plpgsql as $$
begin
  perform pg_temp.act_as(p_reporter);
  perform public.confirm_resolution(p_issue, pg_temp.ver(p_issue), p_solved, p_reason);
  perform pg_temp.done();
end $$;

do $$
declare
  rmp  constant uuid := 'a0000000-0000-4000-8000-000000000001';
  kdp  constant uuid := 'a0000000-0000-4000-8000-000000000002';
  elec constant uuid := 'd0000000-0000-4000-8000-000000000001';
  san  constant uuid := 'd0000000-0000-4000-8000-000000000002';
  sita  constant uuid := pg_temp.u('17');
  gopal constant uuid := pg_temp.u('18');
  ramesh constant uuid := pg_temp.u('13');
  suresh constant uuid := pg_temp.u('14');
  v_garbage uuid;
  v_id uuid;
begin
  -- SUBMITTED (2)
  v_garbage := pg_temp.report(sita, rmp, 'GARBAGE', 'Garbage piling up near bus stand',
    'Nobody has collected the garbage for four days.', 'Bus stand, main road', 16.509100, 80.651200);
  perform pg_temp.report(gopal, rmp, 'ROAD', 'Big pothole on temple street',
    'Two-wheelers are slipping here at night.', 'Temple street, near Rama temple', 16.503800, 80.645600);

  -- UNDER_REVIEW (1)
  v_id := pg_temp.report(sita, rmp, 'DRAINAGE', 'Blocked drain flooding the lane',
    'Dirty water stands in the lane after every rain.', 'Lane behind the school', 16.507400, 80.652900);
  perform pg_temp.review(v_id);

  -- VERIFIED, HIGH (1)
  v_id := pg_temp.report(gopal, rmp, 'WATER', 'No drinking water in ward 4 for two days',
    null, 'Ward 4 water tank', 16.511000, 80.646200);
  perform pg_temp.verify(v_id, 'HIGH');

  -- ASSIGNED to Electrical (Ramesh), CRITICAL (1)
  v_id := pg_temp.report(sita, rmp, 'STREET_LIGHT', 'Live wire hanging from street light pole',
    'The wire is low enough to touch. Children walk here.', 'Pole near the post office', 16.505500, 80.650100);
  perform pg_temp.assign(v_id, 'CRITICAL', elec, ramesh);
  perform pg_temp.act_as(pg_temp.u('16'));
  perform public.support_issue(v_id);
  perform pg_temp.done();

  -- IN_PROGRESS (2): Electrical MEDIUM, Sanitation CRITICAL
  v_id := pg_temp.report(gopal, rmp, 'ELECTRICITY', 'Transformer making loud noise',
    null, 'Transformer at the market', 16.508200, 80.647700);
  perform pg_temp.start(v_id, 'MEDIUM', elec, ramesh);

  v_id := pg_temp.report(sita, rmp, 'SANITATION', 'Public toilet overflowing at market',
    'The smell reaches the vegetable stalls.', 'Weekly market', 16.508600, 80.648400);
  perform pg_temp.start(v_id, 'CRITICAL', san, suresh);
  perform pg_temp.act_as(pg_temp.u('15'));
  perform public.support_issue(v_id);
  perform pg_temp.act_as(pg_temp.u('16'));
  perform public.support_issue(v_id);
  perform pg_temp.done();

  -- RESOLVED, waiting for the citizen (1)
  v_id := pg_temp.report(gopal, rmp, 'GARBAGE', 'Dead animal on the canal bund',
    null, 'Canal bund near the rice mill', 16.502100, 80.653300);
  perform pg_temp.start(v_id, 'HIGH', san, suresh);
  perform pg_temp.resolve(v_id, suresh, 'Removed and the place disinfected');

  -- CLOSED (2): confirmed solved by the reporter
  v_id := pg_temp.report(sita, rmp, 'STREET_LIGHT', 'Street light off on church road',
    null, 'Church road, third pole', 16.504400, 80.644300);
  perform pg_temp.start(v_id, 'LOW', elec, ramesh);
  perform pg_temp.resolve(v_id, ramesh, 'Replaced the bulb');
  perform pg_temp.confirm(v_id, sita, true);

  v_id := pg_temp.report(gopal, rmp, 'DRAINAGE', 'Drain cover broken near school gate',
    null, 'ZP High School side gate', 16.506900, 80.649800);
  perform pg_temp.start(v_id, 'HIGH', san, suresh);
  perform pg_temp.resolve(v_id, suresh, 'New cover fixed');
  perform pg_temp.confirm(v_id, gopal, true);

  -- REOPENED: the reporter said it was not solved (1)
  v_id := pg_temp.report(sita, rmp, 'ROAD', 'Road edge collapsed near the pond',
    null, 'Pond road', 16.510300, 80.643900);
  perform pg_temp.start(v_id, 'MEDIUM', san, suresh);
  perform pg_temp.resolve(v_id, suresh, 'Filled with gravel');
  perform pg_temp.confirm(v_id, sita, false, 'The gravel washed away in the rain');

  -- REJECTED (1)
  v_id := pg_temp.report(sita, rmp, 'OTHER', 'Neighbour plays loud music at night',
    'Every night after 11.', 'Ward 2', null, null);
  perform pg_temp.review(v_id);
  perform pg_temp.act_as(pg_temp.u('12'));
  perform public.reject_issue(v_id, pg_temp.ver(v_id), 'Not a panchayat matter. Please contact the police.');
  perform pg_temp.done();

  -- DUPLICATE of the bus stand garbage report (1)
  v_id := pg_temp.report(gopal, rmp, 'GARBAGE', 'Garbage not cleared at bus stand',
    null, 'Bus stand', 16.509000, 80.651100);
  perform pg_temp.review(v_id);
  perform pg_temp.act_as(pg_temp.u('12'));
  perform public.mark_duplicate(v_id, pg_temp.ver(v_id), v_garbage, 'Same place as the earlier report');
  perform pg_temp.done();

  -- Kondapalli: one submitted issue
  perform pg_temp.report(pg_temp.u('21'), kdp, 'WATER', 'Hand pump broken near the bus stop',
    null, 'Bus stop, Kondapalli', 16.620500, 80.540800);
end $$;

commit;
