'use client';

import { useEffect, useRef, useState } from 'react';
import { doc, updateDoc, serverTimestamp, onSnapshot, deleteDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';

interface GeolocationTrackingOptions {
  routeId: string;
  enableHighAccuracy?: boolean;
  updateInterval?: number; // em milissegundos
  distanceFilter?: number; // em metros
}

export function useGeolocationTracking({
  routeId,
  enableHighAccuracy = true,
  updateInterval = 5000, // 5 segundos
  distanceFilter = 10, // 10 metros
}: GeolocationTrackingOptions) {
  const [location, setLocation] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<GeolocationPositionError | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingHealth, setTrackingHealth] = useState<'healthy' | 'warning' | 'error'>('healthy');
  const watchIdRef = useRef<number | null>(null);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastUpdateRef = useRef<number>(0);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryCountRef = useRef<number>(0);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastSuccessfulUpdateRef = useRef<number>(Date.now());

  const calculateDistance = (
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number => {
    const R = 6371e3; // Raio da Terra em metros
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  };

  const updateLocationInFirebase = async (position: GeolocationPosition) => {
    const now = Date.now();
    const { latitude, longitude, accuracy, heading, speed } = position.coords;

    // Verifica filtro de distância
    if (lastLocationRef.current) {
      const distance = calculateDistance(
        lastLocationRef.current.lat,
        lastLocationRef.current.lng,
        latitude,
        longitude
      );

      // Se moveu menos que o filtro E ainda não passou o intervalo de tempo, não atualiza
      if (distance < distanceFilter && now - lastUpdateRef.current < updateInterval) {
        return;
      }
    }

    try {
      const routeRef = doc(db, 'routes', routeId);
      await updateDoc(routeRef, {
        currentLocation: {
          lat: latitude,
          lng: longitude,
          accuracy,
          heading: heading || null,
          speed: speed || null,
          timestamp: serverTimestamp(),
        },
        lastUpdated: serverTimestamp(),
      });

      lastLocationRef.current = { lat: latitude, lng: longitude };
      lastUpdateRef.current = now;
      lastSuccessfulUpdateRef.current = now;
      retryCountRef.current = 0;
      setTrackingHealth('healthy');
    } catch (err) {
      console.error('❌ Erro ao atualizar localização:', err);
      setTrackingHealth('warning');

      // Retry após falha de conexão
      if (retryCountRef.current < 3) {
        retryCountRef.current++;
        retryTimeoutRef.current = setTimeout(() => {
          updateLocationInFirebase(position);
        }, 5000);
      }
    }
  };

  // Função para tentar adquirir Wake Lock
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.error('❌ Erro ao ativar Wake Lock:', err);
      }
    }
  };

  // Função para liberar Wake Lock
  const releaseWakeLock = async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
        wakeLockRef.current = null;
      } catch (err) {
        console.error('❌ Erro ao liberar Wake Lock:', err);
      }
    }
  };

  // Watchdog: verifica se há atualizações recentes
  const startWatchdog = () => {
    heartbeatIntervalRef.current = setInterval(() => {
      const timeSinceLastUpdate = Date.now() - lastSuccessfulUpdateRef.current;

      // Se passou mais de 2 minutos sem atualização
      if (timeSinceLastUpdate > 120000) {
        console.warn('⚠️ Sem atualizações há mais de 2 minutos. Reiniciando tracking...');
        setTrackingHealth('error');

        // Reinicia o tracking
        stopTracking();
        setTimeout(() => {
          startTracking();
        }, 1000);
      } else if (timeSinceLastUpdate > 60000) {
        // Alerta se passou mais de 1 minuto
        console.warn('⚠️ Sem atualizações há mais de 1 minuto');
        setTrackingHealth('warning');
      }
    }, 30000); // Verifica a cada 30 segundos
  };

  const stopWatchdog = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  const startTracking = () => {
    if (!navigator.geolocation) {
      setError({
        code: 0,
        message: 'Geolocalização não suportada pelo navegador',
      } as GeolocationPositionError);
      return;
    }

    setIsTracking(true);
    setTrackingHealth('healthy');
    lastSuccessfulUpdateRef.current = Date.now();

    // Ativa Wake Lock para manter tela ativa
    requestWakeLock();

    // Inicia watchdog
    startWatchdog();

    // Tenta primeiro com alta precisão
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocation(position);
        setError(null);
        updateLocationInFirebase(position);
      },
      (err) => {
        setError(err);
        console.error('❌ Erro de geolocalização:', err);
        setTrackingHealth('warning');

        // Se timeout ou erro, tenta novamente com baixa precisão após 5 segundos
        if (err.code === err.TIMEOUT) {
          setTimeout(() => {
            if (watchIdRef.current !== null) {
              navigator.geolocation.clearWatch(watchIdRef.current);
            }

            // Reinicia com baixa precisão como fallback
            watchIdRef.current = navigator.geolocation.watchPosition(
              (position) => {
                setLocation(position);
                setError(null);
                updateLocationInFirebase(position);
              },
              (fallbackErr) => {
                console.error('❌ Erro no fallback de geolocalização:', fallbackErr);
                setTrackingHealth('error');
              },
              {
                enableHighAccuracy: false, // Baixa precisão
                maximumAge: 10000,
                timeout: 30000, // Timeout maior
              }
            );
          }, 5000);
        }
      },
      {
        enableHighAccuracy,
        maximumAge: 0,
        timeout: 30000, // Aumentado de 10s para 30s
      }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
    stopWatchdog();
    releaseWakeLock();
    setIsTracking(false);
    setTrackingHealth('healthy');
  };

  // Função para forçar atualização imediata da localização
  const forceLocationUpdate = () => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation(position);
        setError(null);
        // Força atualização ignorando filtros de distância e tempo
        const now = Date.now();
        lastUpdateRef.current = 0; // Reset para forçar atualização
        updateLocationInFirebase(position);
      },
      (err) => {
        console.error('❌ Erro ao obter localização forçada:', err);
        setError(err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 15000,
      }
    );
  };

  // Listener para solicitações de atualização de localização
  useEffect(() => {
    if (!isTracking) return;

    const currentUser = auth.currentUser;
    if (!currentUser) {
      console.warn('⚠️ Usuário não autenticado, não é possível escutar solicitações');
      return;
    }

    const requestRef = doc(db, 'locationUpdateRequests', currentUser.uid);
    const unsubscribe = onSnapshot(
      requestRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          // Força atualização imediata
          forceLocationUpdate();

          // Deleta a solicitação após processar
          try {
            await deleteDoc(requestRef);
          } catch (err) {
            console.error('❌ Erro ao deletar solicitação:', err);
          }
        }
      },
      (error) => {
        console.error('❌ Erro no listener de solicitações:', error);
      }
    );

    return () => {
      unsubscribe();
    };
  }, [isTracking]);

  // Reativar Wake Lock quando a página voltar a ser visível
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isTracking && !wakeLockRef.current) {
        requestWakeLock();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isTracking]);

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, []);

  return {
    location,
    error,
    isTracking,
    trackingHealth,
    startTracking,
    stopTracking,
  };
}
