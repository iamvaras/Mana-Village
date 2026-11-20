// Public configuration (safe to expose to the browser). The service-role key is
// never used by the admin web app.
function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing environment variable ${name}. See apps/admin/.env.example.`);
  return value;
}

export const env = {
  supabaseUrl: required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: required(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
};
