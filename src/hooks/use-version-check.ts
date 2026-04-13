'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

const CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutos
const INITIAL_DELAY = 10 * 1000;       // 10 segundos
const MIN_CHECK_GAP = 30 * 1000;       // 30 segundos debounce

const CLIENT_BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || 'development';

export function useVersionCheck() {
  const [hasNewVersion, setHasNewVersion] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const lastCheckRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkVersion = useCallback(async () => {
    if (CLIENT_BUILD_ID === 'development') return;

    const now = Date.now();
    if (now - lastCheckRef.current < MIN_CHECK_GAP) return;
    lastCheckRef.current = now;

    try {
      const response = await fetch('/api/version', { cache: 'no-store' });
      if (!response.ok) return;

      const data = await response.json();
      if (data.buildId && data.buildId !== CLIENT_BUILD_ID) {
        setHasNewVersion(true);
      }
    } catch {
      // Falha silenciosa — erros de rede não devem exibir o banner
    }
  }, []);

  const forceRefresh = useCallback(async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {
      // Ignora erros ao limpar cache
    }
    window.location.reload();
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  useEffect(() => {
    if (CLIENT_BUILD_ID === 'development') return;

    const initialTimeout = setTimeout(checkVersion, INITIAL_DELAY);

    intervalRef.current = setInterval(checkVersion, CHECK_INTERVAL);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };

    const handleFocus = () => {
      checkVersion();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [checkVersion]);

  return {
    hasNewVersion: hasNewVersion && !dismissed,
    forceRefresh,
    dismiss,
  };
}
