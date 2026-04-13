'use client';

export const IMPERSONATION_SESSION_KEY = 'isImpersonating';
export const IMPERSONATED_DRIVER_NAME_KEY = 'impersonatedDriverName';
export const FIREBASE_APP_MODE_KEY = 'firebaseAppMode';
export const IMPERSONATION_APP_MODE = 'impersonation';
export const IMPERSONATION_ENTRY_PATH = '/impersonate-driver';

function canUseSessionStorage() {
  return typeof window !== 'undefined';
}

export function isImpersonationSessionActive(): boolean {
  if (!canUseSessionStorage()) return false;
  return sessionStorage.getItem(IMPERSONATION_SESSION_KEY) === 'true';
}

export function getImpersonatedDriverNameFromSession(): string | null {
  if (!canUseSessionStorage()) return null;
  return sessionStorage.getItem(IMPERSONATED_DRIVER_NAME_KEY);
}

export function enableImpersonationSession(driverName?: string | null): void {
  if (!canUseSessionStorage()) return;

  sessionStorage.setItem(IMPERSONATION_SESSION_KEY, 'true');
  sessionStorage.setItem(FIREBASE_APP_MODE_KEY, IMPERSONATION_APP_MODE);

  if (driverName) {
    sessionStorage.setItem(IMPERSONATED_DRIVER_NAME_KEY, driverName);
  } else {
    sessionStorage.removeItem(IMPERSONATED_DRIVER_NAME_KEY);
  }
}

export function clearImpersonationSession(): void {
  if (!canUseSessionStorage()) return;

  sessionStorage.removeItem(IMPERSONATION_SESSION_KEY);
  sessionStorage.removeItem(IMPERSONATED_DRIVER_NAME_KEY);
  sessionStorage.removeItem(FIREBASE_APP_MODE_KEY);
}

export function shouldUseImpersonationFirebaseApp(): boolean {
  if (!canUseSessionStorage()) return false;

  return (
    window.location.pathname.startsWith(IMPERSONATION_ENTRY_PATH) ||
    sessionStorage.getItem(FIREBASE_APP_MODE_KEY) === IMPERSONATION_APP_MODE
  );
}
