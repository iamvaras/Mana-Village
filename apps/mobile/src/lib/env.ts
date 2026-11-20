const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Missing configuration is shown on screen instead of crashing at import time. */
export const env = url && anonKey ? { supabaseUrl: url, supabaseAnonKey: anonKey } : null;
