/** Redacting logger: the only allowed logger in production code (Req 15.10). */

export const REDACTED_KEYS: readonly string[] = [
  'transcript',
  'rawTranscript',
  'normalizedText',
  'phone',
  'customerPhone',
  'note',
  'payload',
];

export const REDACTED = '[redacted]';
export const REDACTED_PHONE = '[phone]';

const KEY_SET = new Set(REDACTED_KEYS.map((k) => k.toLowerCase()));
// 10 digits, optionally separated by spaces/dashes/dots, not part of a longer digit run.
const PHONE_RE = /(?<!\d)(?:\d[\s.-]?){9}\d(?!\d)/g;

export function redactString(value: string): string {
  return value.replace(PHONE_RE, REDACTED_PHONE);
}

export function redact(value: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') {
    return typeof value === 'bigint' ? redactString(value.toString()) : value;
  }
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message) };
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => redact(v, seen));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = KEY_SET.has(k.toLowerCase()) ? REDACTED : redact(v, seen);
  }
  return out;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogSink = (level: LogLevel, message: string, data: unknown[]) => void;

export interface Logger {
  debug(message: string, ...data: unknown[]): void;
  info(message: string, ...data: unknown[]): void;
  warn(message: string, ...data: unknown[]): void;
  error(message: string, ...data: unknown[]): void;
}

const defaultSink: LogSink = (level, message, data) => {
  // eslint-disable-next-line no-console
  console[level](message, ...data);
};

export function createLogger(sink: LogSink = defaultSink): Logger {
  const emit =
    (level: LogLevel) =>
    (message: string, ...data: unknown[]): void => {
      sink(
        level,
        redactString(String(message)),
        data.map((d) => redact(d)),
      );
    };
  return { debug: emit('debug'), info: emit('info'), warn: emit('warn'), error: emit('error') };
}
