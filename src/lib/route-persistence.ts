import type { PlaceValue } from './types';

export type RouteInProgress = {
  origin: PlaceValue;
  stops: PlaceValue[];
  routeDate: string;
  routeTime: string;
  timestamp: number; // Quando foi salvo
};

const STORAGE_KEY = 'route_in_progress';

/**
 * Salva uma rota em progresso no localStorage
 */
export function saveRouteInProgress(data: Omit<RouteInProgress, 'timestamp'>): void {
  try {
    const routeData: RouteInProgress = {
      ...data,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(routeData));
  } catch (error) {
    console.error('Erro ao salvar rota em progresso:', error);
  }
}

/**
 * Recupera a rota em progresso do localStorage
 */
export function getRouteInProgress(): RouteInProgress | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    const data = JSON.parse(stored) as RouteInProgress;
    return data;
  } catch (error) {
    console.error('Erro ao recuperar rota em progresso:', error);
    return null;
  }
}

/**
 * Remove a rota em progresso do localStorage
 */
export function clearRouteInProgress(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Erro ao limpar rota em progresso:', error);
  }
}

/**
 * Verifica se existe uma rota em progresso
 */
export function hasRouteInProgress(): boolean {
  return getRouteInProgress() !== null;
}

/**
 * Verifica se a rota em progresso está expirada (mais de 7 dias)
 */
export function isRouteInProgressExpired(): boolean {
  const route = getRouteInProgress();
  if (!route) return false;

  const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
  return Date.now() - route.timestamp > sevenDaysInMs;
}
