'use client';
import { nativeStaffEnabled } from '@/lib/staff/mode';
import { nativeDriverEnabled } from '@/lib/driver/mode';
import {clearDevicePushGrant} from '@/lib/driver/push-device';
import { localSessionId,nativeAuthStorage,nativeStorageKey,retireStoredSession } from './session-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let native: SupabaseClient | undefined;
export const nativeEarningsEnabled = process.env.NEXT_PUBLIC_ROTA_EARNINGS_ENABLED === 'true';

export function earningsBrowserClient() {
  if (typeof window === 'undefined' || (!nativeEarningsEnabled && !nativeDriverEnabled && !nativeStaffEnabled)) return undefined;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return undefined;
  return native ??= createClient(url,key,{ auth: { storageKey:nativeStorageKey,storage:nativeAuthStorage(window.localStorage),detectSessionInUrl:false,flowType:'pkce' } });
}

export async function signOutNativeLocally(client:SupabaseClient,token:string|undefined) {
  await clearDevicePushGrant(localSessionId(token));
  retireStoredSession(window.localStorage,token);
  if (token && localSessionId(token)) {
    // The explicit JWT allows the provider logout to proceed after local cleanup.
    void client.auth.admin.signOut(token,'local').catch(()=>{});
  }
}

export async function signOutEarningsIfPresent() {
  const client = earningsBrowserClient();
  if (!client) return;
  const stored=nativeAuthStorage(window.localStorage).getItem(nativeStorageKey);
  const token=stored ? JSON.parse(stored).access_token:undefined;
  await signOutNativeLocally(client,token);
}
