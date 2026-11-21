# Load test (local only)

Measures the main app reads at realistic volume, as each kind of user, through the
same views and functions the apps call (RLS and permission checks included).

```bash
pnpm db:start                      # local stack with the dev seed
PGPASSWORD=postgres psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -f supabase/load-test/loadgen.sql
python3 supabase/load-test/bench.py 3     # median of 3 runs per query
pnpm db:reset                      # back to the plain seed
```

`loadgen.sql` adds 98 villages (Ramapuram gets 5,000 issues and 2,000 residents, the rest
1,000 issues each), with history, comments, photos, supporters, notifications and audit
rows. `bench.py` prints execution time per query; results from Phase 12 are in
[docs/qa/phase12-report.md](../../docs/qa/phase12-report.md). Run it before each release
and after any change to `issues_view` or the permission helpers.
