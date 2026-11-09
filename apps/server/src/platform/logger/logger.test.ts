import { Writable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { createLogger, LOG_DENY_LIST, withLogContext } from './index';

function capture() {
  const chunks: string[] = [];
  const destination = new Writable({
    write(chunk: Buffer, _enc, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  return {
    logger: createLogger({ level: 'info', pretty: false, destination }),
    lines: () =>
      chunks
        .join('')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  };
}

describe('logger', () => {
  it('redacts deny-listed fields at any depth', () => {
    const { lines, logger } = capture();
    logger.info(
      {
        note: 'secret',
        report: { privateNote: 'x', nested: { email: 'a@b.c', answers: ['1'] } },
        keep: 'visible',
      },
      'msg',
    );
    const [line] = lines();
    expect(line?.['note']).toBe('[redacted]');
    expect((line?.['report'] as Record<string, unknown>)['privateNote']).toBe('[redacted]');
    const nested = (line?.['report'] as Record<string, Record<string, unknown>>)['nested'];
    expect(nested?.['email']).toBe('[redacted]');
    expect(nested?.['answers']).toBe('[redacted]');
    expect(line?.['keep']).toBe('visible');
  });

  it('adds the request id to every line inside a request', () => {
    const { lines, logger } = capture();
    withLogContext({ requestId: 'req-123' }, () => logger.info('inside'));
    logger.info('outside');
    const [inside, outside] = lines();
    expect(inside?.['requestId']).toBe('req-123');
    expect(outside?.['requestId']).toBeUndefined();
  });

  it('covers private details, claim answers, ID numbers and secrets', () => {
    for (const key of [
      'note',
      'answers',
      'univIdNumber',
      'otp',
      'password',
      'token',
      'email',
      'phoneNumber',
    ]) {
      expect(LOG_DENY_LIST).toContain(key);
    }
  });
});
