import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@mana/core';

/** The typed Supabase client every service receives. Each app creates its own. */
export type ManaClient = SupabaseClient<Database>;
