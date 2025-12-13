/**
 * Utilitário de logging condicional
 * Logs de debug só aparecem em desenvolvimento
 * Logs de erro sempre aparecem
 */

const isDev = process.env.NODE_ENV === 'development';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  prefix?: string;
  showTimestamp?: boolean;
}

function formatMessage(level: LogLevel, prefix: string | undefined, args: unknown[]): unknown[] {
  const timestamp = new Date().toISOString();
  const levelEmoji = {
    debug: '🔍',
    info: 'ℹ️',
    warn: '⚠️',
    error: '❌',
  };

  const prefixStr = prefix ? `[${prefix}]` : '';
  const levelStr = `${levelEmoji[level]}`;

  return [`${levelStr} ${prefixStr}`, ...args];
}

/**
 * Logger que só exibe mensagens em desenvolvimento
 */
export const logger = {
  /**
   * Log de debug - só aparece em desenvolvimento
   */
  debug: (...args: unknown[]): void => {
    if (isDev) {
      console.log(...formatMessage('debug', undefined, args));
    }
  },

  /**
   * Log de info - só aparece em desenvolvimento
   */
  info: (...args: unknown[]): void => {
    if (isDev) {
      console.info(...formatMessage('info', undefined, args));
    }
  },

  /**
   * Log de warning - sempre aparece
   */
  warn: (...args: unknown[]): void => {
    console.warn(...formatMessage('warn', undefined, args));
  },

  /**
   * Log de erro - sempre aparece
   */
  error: (...args: unknown[]): void => {
    console.error(...formatMessage('error', undefined, args));
  },
};

/**
 * Cria um logger com prefixo personalizado
 * Útil para identificar de qual módulo o log está vindo
 *
 * @example
 * const log = createLogger('AuthProvider');
 * log.debug('Usuário autenticado', { uid: '123' });
 * // Output: 🔍 [AuthProvider] Usuário autenticado { uid: '123' }
 */
export function createLogger(prefix: string) {
  return {
    debug: (...args: unknown[]): void => {
      if (isDev) {
        console.log(...formatMessage('debug', prefix, args));
      }
    },
    info: (...args: unknown[]): void => {
      if (isDev) {
        console.info(...formatMessage('info', prefix, args));
      }
    },
    warn: (...args: unknown[]): void => {
      console.warn(...formatMessage('warn', prefix, args));
    },
    error: (...args: unknown[]): void => {
      console.error(...formatMessage('error', prefix, args));
    },
  };
}

export default logger;
