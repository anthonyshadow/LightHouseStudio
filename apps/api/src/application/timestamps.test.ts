import { describe, expect, it } from 'vitest';
import { nullableIsoTimestamp, persistedTimestampSchema, toIsoTimestamp } from './timestamps.js';

describe('persisted timestamps', () => {
  it('normalizes Neon/Postgres and offset timestamps to canonical UTC ISO strings', () => {
    expect(toIsoTimestamp('2026-08-07 12:00:00+00')).toBe('2026-08-07T12:00:00.000Z');
    expect(persistedTimestampSchema.parse('2026-08-07T08:00:00-04:00')).toBe(
      '2026-08-07T12:00:00.000Z',
    );
    expect(nullableIsoTimestamp(null)).toBeNull();
  });

  it('rejects invalid persisted values', () => {
    expect(() => persistedTimestampSchema.parse('not-a-date')).toThrow();
  });
});
