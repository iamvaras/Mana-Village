import subprocess, re, statistics, sys, os, json
os.environ['PGPASSWORD']='postgres'
RMP='a0000000-0000-4000-8000-000000000001'
U=lambda n:'b0000000-0000-4000-8000-0000000000%02d'%n
LC=subprocess.run(['psql','-h','127.0.0.1','-p','54322','-U','postgres','-At','-c',"select recipient_id from public.notifications group by 1 order by count(*) desc limit 1"],capture_output=True,text=True).stdout.strip()
P={'loadcitizen':LC,'citizen':U(15),'secretary':U(12),'worker':U(13),'super_admin':U(1)}
first_issue = subprocess.run(['psql','-h','127.0.0.1','-p','54322','-U','postgres','-At','-c',
 f"select id from public.issues where village_id='{RMP}' and visibility='PUBLIC' order by created_at desc offset 300 limit 1"],capture_output=True,text=True).stdout.strip()
cat = subprocess.run(['psql','-h','127.0.0.1','-p','54322','-U','postgres','-At','-c',"select id from public.issue_categories order by key limit 1"],capture_output=True,text=True).stdout.strip()
SUM="id, issue_number, title, status, priority, category_name, category_name_local, location_text, supporter_count, is_mine, i_support, created_at, last_status_change_at"
COLS="id, issue_number, title, status, priority, visibility, category_name, assigned_department_name, assigned_user_name, supporter_count, reopen_count, created_at, last_status_change_at"
Q=[
 ('citizen','My issues (mine or supported)',f"select {SUM} from public.issues_view where (is_mine or i_support) order by last_status_change_at desc limit 200"),
 ('citizen','My issues via list_my_issues()',f"select {SUM} from public.list_my_issues(200)"),
 ('citizen','Village feed, 50 newest',f"select {SUM} from public.issues_view where village_id='{RMP}' order by created_at desc limit 50"),
 ('citizen','Issue detail',f"select * from public.issues_view where id='{first_issue}'"),
 ('citizen','Issue timeline',f"select * from public.issue_timeline_view where issue_id='{first_issue}'"),
 ('citizen','Issue comments',f"select * from public.issue_comments_view where issue_id='{first_issue}'"),
 ('citizen','Issue photos',f"select * from public.issue_attachments_view where issue_id='{first_issue}'"),
 ('citizen','Notifications, 50 newest',"select * from public.notifications order by created_at desc limit 50"),
 ('citizen','Unread notification count',"select count(*) from public.notifications where read_at is null"),
 ('citizen','Similar issues',f"select * from public.find_similar_issues('{RMP}','{cat}',16.5,80.6,200)"),
 ('secretary','All Issues page 1 + exact count',f"select {COLS}, count(*) over () from public.issues_view where village_id='{RMP}' order by created_at desc limit 25"),
 ('secretary','All Issues, open filter',f"select {COLS}, count(*) over () from public.issues_view where village_id='{RMP}' and status in ('SUBMITTED','UNDER_REVIEW','VERIFIED') order by created_at desc limit 25"),
 ('secretary','All Issues, search',f"select {COLS}, count(*) over () from public.issues_view where village_id='{RMP}' and (title ilike '%4321%' or issue_number ilike '%4321%') order by created_at desc limit 25"),
 ('secretary','All Issues, page 100',f"select {COLS} from public.issues_view where village_id='{RMP}' order by created_at desc limit 25 offset 2475"),
 ('secretary','Dashboard stats (30 days)',f"select * from public.dashboard_stats('{RMP}', now()-interval '30 days', now())"),
 ('secretary','Analytics report (1 year)',f"select * from public.analytics_report('{RMP}', now()-interval '365 days', now())"),
 ('secretary','Issues by category',f"select * from public.issues_by_category('{RMP}', now()-interval '365 days', now())"),
 ('secretary','Audit log, first page',f"select * from public.list_audit_logs('{RMP}', null, null, null, null, null, null, 50)"),
 ('secretary','Users list',f"select * from public.admin_list_users('{RMP}', null, null, 50, 0)"),
 ('secretary','Issue timeline (staff)',f"select * from public.issue_timeline_view where issue_id='{first_issue}'"),
 ('loadcitizen','Notifications, 50 newest (busy user)',"select * from public.notifications order by created_at desc limit 50"),
 ('loadcitizen','Unread count (busy user)',"select count(*) from public.notifications where read_at is null"),
 ('loadcitizen','My issues (busy user)',f"select {SUM} from public.list_my_issues(200)"),
 ('worker','My work list',"select * from public.list_my_work()"),
 ('super_admin','All Issues page 1 + count',f"select {COLS}, count(*) over () from public.issues_view where village_id='{RMP}' order by created_at desc limit 25"),
]
N=int(sys.argv[1]) if len(sys.argv)>1 else 5
out=[]
for who,name,sql in Q:
  claims=json.dumps({'sub':P[who],'role':'authenticated','aal':'aal2'})
  body=f"begin; set local role authenticated; select set_config('request.jwt.claims', '{claims}', true);\n"+f"explain (analyze, buffers) {sql};\n"*N+"rollback;\n"
  r=subprocess.run(['psql','-h','127.0.0.1','-p','54322','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],input=body,capture_output=True,text=True)
  t=[float(x) for x in re.findall(r'Execution Time: ([\d.]+) ms',r.stdout)]
  pt=[float(x) for x in re.findall(r'Planning Time: ([\d.]+) ms',r.stdout)]
  rows=re.search(r'\(actual time=[\d.]+\.\.[\d.]+ rows=(\d+)',r.stdout)
  if not t: print('ERR',who,name,r.stderr[-400:]); continue
  med=statistics.median(t); plan=statistics.median(pt)
  out.append((who,name,round(med,1),round(plan,1),rows.group(1) if rows else '?'))
  print(f"{who:12} {name:36} exec {med:8.1f} ms  plan {plan:6.1f} ms  rows {rows.group(1) if rows else '?'}",flush=True)
json.dump(out,open(sys.argv[2] if len(sys.argv)>2 else 'load-test-result.json','w'))
