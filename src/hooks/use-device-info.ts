'use client';

import { useEffect, useRef, useCallback } from 'react';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase/client';

export interface DeviceInfo {
  // Informacoes do dispositivo
  userAgent: string;
  platform: string;
  deviceModel: string;
  osName: string;
  osVersion: string;
  browserName: string;
  browserVersion: string;
  screenWidth: number;
  screenHeight: number;
  devicePixelRatio: number;
  language: string;
  // Status de rede
  connectionType: string;
  connectionEffectiveType: string;
  downlink: number | null;
  rtt: number | null;
  saveData: boolean;
  online: boolean;
  // Status da bateria
  batteryLevel: number | null;
  batteryCharging: boolean | null;
  // Timestamp
  lastUpdated: Date;
}

// Parse user agent to extract device info
function parseUserAgent(ua: string): { deviceModel: string; osName: string; osVersion: string; browserName: string; browserVersion: string } {
  let deviceModel = 'Desconhecido';
  let osName = 'Desconhecido';
  let osVersion = '';
  let browserName = 'Desconhecido';
  let browserVersion = '';

  // Detect OS
  if (/Android/i.test(ua)) {
    osName = 'Android';
    const match = ua.match(/Android\s+([\d.]+)/);
    osVersion = match ? match[1] : '';

    // Try to extract device model from Android user agent
    const modelMatch = ua.match(/;\s*([^;)]+)\s*Build/);
    if (modelMatch) {
      deviceModel = modelMatch[1].trim();
    }
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    osName = 'iOS';
    const match = ua.match(/OS\s+([\d_]+)/);
    osVersion = match ? match[1].replace(/_/g, '.') : '';

    if (/iPhone/i.test(ua)) deviceModel = 'iPhone';
    else if (/iPad/i.test(ua)) deviceModel = 'iPad';
    else if (/iPod/i.test(ua)) deviceModel = 'iPod';
  } else if (/Windows/i.test(ua)) {
    osName = 'Windows';
    const match = ua.match(/Windows NT\s+([\d.]+)/);
    osVersion = match ? match[1] : '';
    deviceModel = 'PC';
  } else if (/Mac OS X/i.test(ua)) {
    osName = 'macOS';
    const match = ua.match(/Mac OS X\s+([\d_]+)/);
    osVersion = match ? match[1].replace(/_/g, '.') : '';
    deviceModel = 'Mac';
  } else if (/Linux/i.test(ua)) {
    osName = 'Linux';
    deviceModel = 'PC';
  }

  // Detect browser
  if (/Chrome/i.test(ua) && !/Edge|Edg/i.test(ua)) {
    browserName = 'Chrome';
    const match = ua.match(/Chrome\/([\d.]+)/);
    browserVersion = match ? match[1] : '';
  } else if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) {
    browserName = 'Safari';
    const match = ua.match(/Version\/([\d.]+)/);
    browserVersion = match ? match[1] : '';
  } else if (/Firefox/i.test(ua)) {
    browserName = 'Firefox';
    const match = ua.match(/Firefox\/([\d.]+)/);
    browserVersion = match ? match[1] : '';
  } else if (/Edge|Edg/i.test(ua)) {
    browserName = 'Edge';
    const match = ua.match(/Edg(?:e)?\/([\d.]+)/);
    browserVersion = match ? match[1] : '';
  }

  return { deviceModel, osName, osVersion, browserName, browserVersion };
}

// Get network info
function getNetworkInfo(): { connectionType: string; connectionEffectiveType: string; downlink: number | null; rtt: number | null; saveData: boolean } {
  const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

  if (connection) {
    return {
      connectionType: connection.type || 'unknown',
      connectionEffectiveType: connection.effectiveType || 'unknown',
      downlink: connection.downlink || null,
      rtt: connection.rtt || null,
      saveData: connection.saveData || false,
    };
  }

  return {
    connectionType: 'unknown',
    connectionEffectiveType: 'unknown',
    downlink: null,
    rtt: null,
    saveData: false,
  };
}

// Get battery info
async function getBatteryInfo(): Promise<{ level: number | null; charging: boolean | null }> {
  if ('getBattery' in navigator) {
    try {
      const battery = await (navigator as any).getBattery();
      return {
        level: Math.round(battery.level * 100),
        charging: battery.charging,
      };
    } catch {
      return { level: null, charging: null };
    }
  }
  return { level: null, charging: null };
}

// Collect all device info
export async function collectDeviceInfo(): Promise<DeviceInfo> {
  const ua = navigator.userAgent;
  const parsed = parseUserAgent(ua);
  const network = getNetworkInfo();
  const battery = await getBatteryInfo();

  return {
    userAgent: ua,
    platform: navigator.platform,
    deviceModel: parsed.deviceModel,
    osName: parsed.osName,
    osVersion: parsed.osVersion,
    browserName: parsed.browserName,
    browserVersion: parsed.browserVersion,
    screenWidth: screen.width,
    screenHeight: screen.height,
    devicePixelRatio: window.devicePixelRatio,
    language: navigator.language,
    connectionType: network.connectionType,
    connectionEffectiveType: network.connectionEffectiveType,
    downlink: network.downlink,
    rtt: network.rtt,
    saveData: network.saveData,
    online: navigator.onLine,
    batteryLevel: battery.level,
    batteryCharging: battery.charging,
    lastUpdated: new Date(),
  };
}

// Hook to collect and update device info
export function useDeviceInfo(enabled: boolean = true) {
  const lastUpdateRef = useRef<number>(0);
  const UPDATE_INTERVAL = 60000; // 1 minuto

  const updateDeviceInfo = useCallback(async () => {
    // Não coletar informações durante impersonação
    const isImpersonating = typeof window !== 'undefined' && localStorage.getItem('isImpersonating') === 'true';
    if (!enabled || isImpersonating) return;

    const currentUser = auth.currentUser;
    if (!currentUser) return;

    const now = Date.now();
    // Evita atualizacoes muito frequentes
    if (now - lastUpdateRef.current < UPDATE_INTERVAL) return;
    lastUpdateRef.current = now;

    try {
      const deviceInfo = await collectDeviceInfo();

      const userRef = doc(db, 'users', currentUser.uid);
      await updateDoc(userRef, {
        deviceInfo: {
          ...deviceInfo,
          lastUpdated: serverTimestamp(),
        },
      });
    } catch (error) {
      console.error('Erro ao atualizar info do dispositivo:', error);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    // Atualiza imediatamente ao montar
    updateDeviceInfo();

    // Atualiza periodicamente
    const interval = setInterval(updateDeviceInfo, UPDATE_INTERVAL);

    // Atualiza quando a conexao muda
    const handleOnline = () => updateDeviceInfo();
    const handleOffline = () => updateDeviceInfo();

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Atualiza quando a rede muda
    const connection = (navigator as any).connection;
    if (connection) {
      connection.addEventListener('change', updateDeviceInfo);
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (connection) {
        connection.removeEventListener('change', updateDeviceInfo);
      }
    };
  }, [enabled, updateDeviceInfo]);

  return { updateDeviceInfo };
}
