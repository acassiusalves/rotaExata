'use client';

import {locationRequestDelivery} from '@/lib/driver/location-request';

import { useEffect, useRef, useState } from 'react';
import { useDriverRuntime } from '@/components/driver/driver-runtime';
import { driverCommand,driverQuery } from '@/lib/driver/runtime-client';
import { locationPublisher } from '@/lib/driver/location-publish';

interface GeolocationTrackingOptions {
  routeId: string;
  enabled?: boolean;
  enableHighAccuracy?: boolean;
  updateInterval?: number; // em milissegundos
  distanceFilter?: number; // em metros
}

export function useGeolocationTracking({
  routeId,
  enabled=true,
  enableHighAccuracy = true,
  updateInterval = 5000, // 5 segundos
  distanceFilter = 10, // 10 metros
}: GeolocationTrackingOptions) {
  const {request,endpoint}=useDriverRuntime();
  const [location, setLocation] = useState<GeolocationPosition | null>(null);
  const [error, setError] = useState<GeolocationPositionError | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [trackingHealth, setTrackingHealth] = useState<'healthy' | 'warning' | 'error'>('healthy');
  const watchIdRef = useRef<number | null>(null);
  const publisherRef = useRef(locationPublisher({ interval: updateInterval, distance: distanceFilter }));
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const lastSuccessfulUpdateRef = useRef<number>(Date.now());

  const publishLocation = async (position: GeolocationPosition, requestRevision?: string) => {
    if (!enabled) return false;
    const now = Date.now();
    const { latitude, longitude, accuracy, heading, speed } = position.coords;
    const publisher = publisherRef.current;
    const point = { lat: latitude, lng: longitude };

    // Filtro de distância/tempo, espera após falha e parada definitiva em 404.
    if (!publisher.due(now, point, Boolean(requestRevision))) return false;
    publisher.attempted(now);

    try {
      const ack=await driverCommand<{acknowledgedRevision?:string}>(request,endpoint,{kind:'location',routeId,requestRevision,location:{
        lat:latitude,lng:longitude,accuracy,heading:heading ?? null,speed:speed ?? null,
      }});

      publisher.succeeded(now, point);
      lastSuccessfulUpdateRef.current = now;
      setTrackingHealth('healthy');
      return !requestRevision || ack.acknowledgedRevision===requestRevision;
    } catch (err) {
      const next = publisher.failed(err);
      if (next === 'halt') {
        // A rota não aceita mais localização (finalizada ou retirada do motorista).
        stopTracking();
        return false;
      }
      console.error('❌ Erro ao atualizar localização:', err);
      setTrackingHealth('warning');

      // Uma única nova tentativa pendente por vez, respeitando o intervalo.
      if (!requestRevision && next === 'retry') {
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = setTimeout(() => {
          publishLocation(position);
        }, updateInterval);
      }
      return false;
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
    if (!enabled || publisherRef.current.halted) return;
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
        publishLocation(position);
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
                publishLocation(position);
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
  const forceLocationUpdate = (requestRevision:string)=>new Promise<boolean>(resolve=>{
    navigator.geolocation.getCurrentPosition(
      position=>{
        setLocation(position);setError(null);
        void publishLocation(position,requestRevision).then(value=>resolve(value===true),()=>resolve(false));
      },
      err=>{setError(err);resolve(false);},
      {enableHighAccuracy:true,maximumAge:0,timeout:15000},
    );
  });

  useEffect(()=>{
    if (!isTracking || !enabled) return;
    let current=true;
    const refresh=locationRequestDelivery(
      async()=> (await request<{revision:string|null}>(driverQuery(endpoint,'location-request'))).revision,
      forceLocationUpdate,()=>current,
    );
    void refresh();
    const timer=setInterval(refresh,8000);
    return()=>{current=false;clearInterval(timer);};
  },[isTracking,enabled,endpoint,request,routeId]);

  // Rota deixou de ser rastreável (ou mudou): o próximo início começa do zero.
  useEffect(() => {
    if (!enabled) publisherRef.current.resume();
  }, [enabled]);
  useEffect(() => {
    publisherRef.current = locationPublisher({ interval: updateInterval, distance: distanceFilter });
  }, [routeId, updateInterval, distanceFilter]);

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
