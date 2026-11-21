# Launch setup: staging, test builds, phone testing

The order to bring Mana Village up on real services. Staging first; production repeats
the same steps in a second Supabase project once staging is proven.

Secrets (database password, service role key, push secret, Expo token) stay in your
password manager, the Supabase dashboard and EAS. They never go in git or chat.

## 1. Supabase staging project

1. supabase.com/dashboard → **New project**: name `mana-village-staging`, region
   **South Asia (Mumbai)**, generated database password (save it).
2. **Database → Extensions**: enable `pg_net` (before the first push, so it lands in the
   `extensions` schema; see docs/qa/phase12-report.md).
3. From the repo root on your computer:

   ```bash
   pnpm exec supabase login
   pnpm exec supabase link --project-ref <ref>          # asks for the database password
   pnpm exec supabase db push                           # applies all migrations (no seed)
   pnpm exec supabase db advisors --linked              # expect only the accepted items in the QA report
   ```

   The dev seed is **not** pushed. Create the first village and Super Admin with
   `supabase/seed/`-style SQL in the SQL editor, or ask Claude for a one-off script.

## 2. Auth settings (dashboard → Authentication)

- **Phone** provider on. Until the SMS provider (DLT-registered templates) is chosen, add
  test numbers under *Phone → Test OTP* (for example `919000000001=123456`).
- **MFA → TOTP** enabled.
- Rate limits: keep defaults; review before launch.
- Signups open (decided in Phase 0).

## 3. Edge Functions and secrets

```bash
pnpm exec supabase functions deploy invite-staff prepare-mfa send-push push-receipts
pnpm exec supabase secrets set PUSH_SECRET=<random 32+ chars> ADMIN_WEB_ORIGIN=<admin URL>
# after step 4 (Expo): EXPO_ACCESS_TOKEN=<token from expo.dev, optional but recommended>
```

Then store the functions URL and the same push secret in Vault (SQL editor; see docs/api.md
"Turning on push"). Until this is done the database never calls out:

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1', 'edge_functions_url');
select vault.create_secret('<same PUSH_SECRET>', 'push_secret');
```

## 4. Expo / EAS (Android test build)

1. Create a free account at expo.dev.
2. In `apps/mobile`:

   ```bash
   pnpm dlx eas-cli login
   pnpm dlx eas-cli init                      # writes extra.eas.projectId into app.json: commit it
   pnpm dlx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_URL --value https://<ref>.supabase.co --visibility plaintext
   pnpm dlx eas-cli env:create --environment preview --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value <anon/publishable key> --visibility plaintext
   ```

3. Android push needs Firebase: create a Firebase project and add an Android app with
   package `in.manavillage.app`. Download its `google-services.json` into `apps/mobile` and
   set `"googleServicesFile": "./google-services.json"` under `android` in app.json. Then
   upload the FCM V1 service-account key with `eas credentials` (Android → Push
   Notifications). Expo's guide: "FCM credentials".
4. Build: `pnpm dlx eas-cli build --profile preview --platform android`. Open the link on
   the phone and install the APK.

iOS needs an Apple Developer account (paid); same flow with `--platform ios` later.

## 5. Phone test checklist

On a low-end Android if possible, with mobile data:

- [ ] Sign in with a test phone number; finish profile; pick village
- [ ] Report an issue with 2 photos and GPS; turn on airplane mode mid-upload, turn it off: the report completes once, no duplicate
- [ ] Report with GPS off (landmark only)
- [ ] Admin (staff phone) verifies and assigns; resident gets a push; tapping it opens the issue
- [ ] Worker phone: Work tab shows it; start, add progress photo, resolve
- [ ] Resident: "Was it fixed?" Yes and No paths
- [ ] Switch to Telugu: every screen readable, no clipped text
- [ ] Phone text size at largest; TalkBack reads buttons and photo actions
- [ ] Sign out, uninstall: push token revoked (no more pushes)

## 6. Admin website

Deploy `apps/admin` (Vercel or similar) with `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` for staging; set `ADMIN_WEB_ORIGIN` (step 3) to its URL.
Check the browser console shows no Content-Security-Policy errors.
