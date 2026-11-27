import { staffReturnPath } from '../staff/access.ts';
import { nativeStaffEnabled } from '../staff/mode.ts';

export const nativeDriverEnabled = process.env.NEXT_PUBLIC_ROTA_DRIVER_AUTH === 'supabase';

export function driverReturnPath(value: unknown) {
  if (typeof value==='string' && value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n]/.test(value)) {
    const url=new URL(value,'https://rota-exata.invalid');
    if (url.origin==='https://rota-exata.invalid' &&
        (/^\/my-routes(?:\/|$)/.test(url.pathname) || /^\/driver\/(?!login(?:\/|$))/.test(url.pathname))) {
      return url.pathname+url.search+url.hash;
    }
  }
  return '/my-routes';
}

export function accountReturnPath(value:unknown) {
  const staffPath=nativeStaffEnabled ? staffReturnPath(value) : null;
  if (staffPath) return staffPath;
  if (typeof value==='string' && value.startsWith('/') && !value.startsWith('//') && !/[\\\r\n]/.test(value)) {
    const url=new URL(value,'https://rota-exata.invalid');
    if (url.origin==='https://rota-exata.invalid') {
      if (url.pathname==='/driver/conta' || url.pathname.startsWith('/driver/conta/')) return '/my-routes';
      if (/^\/financeiro(?:\/|$)/.test(url.pathname)) return url.pathname+url.search+url.hash;
      return driverReturnPath(url.pathname+url.search+url.hash);
    }
  }
  return '/my-routes';
}
