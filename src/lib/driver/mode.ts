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
