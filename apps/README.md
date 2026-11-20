# Apps

- `mobile/`: Expo (React Native) app for citizens and field workers. Created in Phase 3.
- `admin/`: Next.js admin web app. Created in Phase 3.

Both apps read and write data only through `packages/core` (types, rules, validation)
and the shared services layer (`packages/services`, Phase 3), never by calling Supabase
directly from components.
