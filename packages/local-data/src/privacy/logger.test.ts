import { describe, expect, it } from 'vitest';
import { createLogger, type LogLevel } from './logger.js';

function capture() {
  const calls: { level: LogLevel; message: string; data: unknown[] }[] = [];
  const logger = createLogger((level, message, data) => calls.push({ level, message, data }));
  return { calls, logger };
}

describe('createLogger', () => {
  it('redacts sensitive keys, including nested ones', () => {
    const { calls, logger } = capture();
    logger.info('saved', {
      transcript: 'do kilo atta',
      nested: { customerPhone: 'x', note: 'n', payload: { a: 1 }, ok: 5 },
    });
    const out = JSON.stringify(calls[0]);
    expect(out).not.toContain('do kilo atta');
    expect(out).not.toContain('"a":1');
    expect(calls[0]!.data[0]).toMatchObject({ nested: { ok: 5, note: '[redacted]' } });
  });

  it('replaces 10-digit phone patterns in messages and values', () => {
    const { calls, logger } = capture();
    logger.error('call 9876543210 failed', { text: 'ring 98765-43210 now', n: 12345 });
    const out = JSON.stringify(calls[0]);
    expect(out).not.toMatch(/9876543210|98765-43210/);
    expect(out).toContain('12345');
  });

  it('handles errors and circular references', () => {
    const { calls, logger } = capture();
    const a: Record<string, unknown> = {};
    a.self = a;
    logger.warn('x', new Error('bad 9876543210'), a);
    expect(JSON.stringify(calls[0])).not.toContain('9876543210');
  });
});
