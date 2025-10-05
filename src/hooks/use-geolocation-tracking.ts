'use client';

import { useEffect, useRef, useState } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/client';

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
  const watchIdRef = useRef<number | null>(null);
  const lastLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  const lastUpdateRef = useRef<number>(0);

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
    } catch (err) {
      console.error('Erro ao atualizar localização:', err);
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

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        setLocation(position);
        setError(null);
        updateLocationInFirebase(position);
      },
      (err) => {
        setError(err);
        console.error('Erro de geolocalização:', err);
      },
      {
        enableHighAccuracy,
        maximumAge: 0,
        timeout: 10000,
      }
    );
  };

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  };

  useEffect(() => {
    return () => {
      stopTracking();
    };
  }, []);

  return {
    location,
    error,
    isTracking,
    startTracking,
    stopTracking,
  };
}
