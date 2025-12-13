import { Timestamp } from 'firebase/firestore';

/**
 * Converte Timestamp do Firestore ou Date para Date
 * @param value - Timestamp do Firestore ou Date
 * @returns Date JavaScript
 */
export function toDate(value: Timestamp | Date | undefined | null): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  // Fallback para objetos com toDate (ex: Timestamp não tipado)
  if (typeof (value as { toDate?: () => Date }).toDate === 'function') {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

/**
 * Converte Date para Timestamp do Firestore
 * @param date - Date JavaScript
 * @returns Timestamp do Firestore
 */
export function toTimestamp(date: Date | undefined | null): Timestamp | null {
  if (!date) return null;
  return Timestamp.fromDate(date);
}

/**
 * Formata data para exibição no formato brasileiro
 * @param value - Timestamp ou Date
 * @param options - Opções de formatação
 * @returns String formatada ou string vazia se valor inválido
 */
export function formatDate(
  value: Timestamp | Date | undefined | null,
  options: {
    includeTime?: boolean;
    includeSeconds?: boolean;
  } = {}
): string {
  const date = toDate(value);
  if (!date) return '';

  const { includeTime = false, includeSeconds = false } = options;

  const dateStr = date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  if (!includeTime) return dateStr;

  const timeStr = date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    ...(includeSeconds ? { second: '2-digit' } : {}),
  });

  return `${dateStr} ${timeStr}`;
}

/**
 * Formata apenas o horário
 * @param value - Timestamp ou Date
 * @returns String formatada (HH:mm) ou vazia
 */
export function formatTime(value: Timestamp | Date | undefined | null): string {
  const date = toDate(value);
  if (!date) return '';

  return date.toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Verifica se duas datas são do mesmo dia
 */
export function isSameDay(
  date1: Timestamp | Date | undefined | null,
  date2: Timestamp | Date | undefined | null
): boolean {
  const d1 = toDate(date1);
  const d2 = toDate(date2);
  if (!d1 || !d2) return false;

  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

/**
 * Retorna tempo relativo (ex: "há 5 minutos")
 */
export function timeAgo(value: Timestamp | Date | undefined | null): string {
  const date = toDate(value);
  if (!date) return '';

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return 'agora mesmo';
  if (diffMinutes < 60) return `há ${diffMinutes} min`;
  if (diffHours < 24) return `há ${diffHours}h`;
  if (diffDays === 1) return 'ontem';
  if (diffDays < 7) return `há ${diffDays} dias`;

  return formatDate(date);
}
