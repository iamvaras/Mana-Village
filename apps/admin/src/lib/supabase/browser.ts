'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@mana/core';
import { createServices, type Services } from '@mana/services';

let services: Services | null = null;

/** Services bound to the browser Supabase client (session kept in cookies). */
export function getBrowserServices(): Services {
  if (!services) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Supabase is not configured. See apps/admin/.env.example.');
    services = createServices(createBrowserClient<Database>(url, key));
  }
  return services;
}
