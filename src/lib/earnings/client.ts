'use client';
import { nativeDriverEnabled } from '@/lib/driver/mode';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let native: SupabaseClient | undefined;
export const nativeEarningsEnabled = process.env.NEXT_PUBLIC_ROTA_EARNINGS_ENABLED === 'true';

export function earningsBrowserClient() {
  if (typeof window === 'undefined' || (!nativeEarningsEnabled && !nativeDriverEnabled)) return undefined;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return undefined;
  return native ??= createClient(url,key,{ auth: { storageKey: 'rotaexata-platform-auth', detectSessionInUrl: false, flowType: 'pkce' } });
}

export async function signOutEarningsIfPresent() {
  const client = earningsBrowserClient();
  if (!client) return;
  const { data } = await client.auth.getSession();
  if (data.session) await client.auth.signOut({ scope: 'local' });
}
