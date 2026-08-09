import { it } from '@fast-check/vitest';
import fc from 'fast-check';
import { expect } from 'vitest';
import { contentRangeHeaders, parseByteRange } from './byte-range.js';

const validRange = fc.integer({ min: 1, max: 10_000_000 }).chain((size) =>
  fc.integer({ min: 0, max: size - 1 }).chain((start) =>
    fc.record({
      size: fc.constant(size),
      start: fc.constant(start),
      requestedEnd: fc.option(fc.integer({ min: start, max: size * 2 }), { nil: undefined }),
    }),
  ),
);

it.prop([validRange], { seed: 0x42595445, numRuns: 100 })(
  'parses supported byte ranges and calculates internally consistent response headers',
  ({ size, start, requestedEnd }) => {
    const parsed = parseByteRange(
      `bytes=${start}-${requestedEnd === undefined ? '' : requestedEnd}`,
      size,
    );

    expect(parsed).toEqual({ start, end: Math.min(requestedEnd ?? size - 1, size - 1) });
    expect(parsed).not.toBeNull();
    if (parsed === null) return;

    const headers = contentRangeHeaders(parsed, size);
    expect(headers).toEqual({
      contentRange: `bytes ${parsed.start}-${parsed.end}/${size}`,
      contentLength: parsed.end - parsed.start + 1,
    });
    expect(headers.contentLength).toBeGreaterThan(0);
    expect(headers.contentLength).toBeLessThanOrEqual(size);
  },
);

it.prop(
  [
    fc.string({ maxLength: 80 }).filter((value) => !/^bytes=\d+-\d*$/u.test(value)),
    fc.integer({ min: 1, max: 10_000_000 }),
  ],
  { seed: 0x52414e47, numRuns: 100 },
)('rejects every generated header outside the supported single-range grammar', (value, size) => {
  expect(() => parseByteRange(value, size)).toThrow();
});

const unavailableRange = fc.integer({ min: 1, max: 10_000_000 }).chain((size) =>
  fc.oneof(
    fc.integer({ min: size, max: size * 2 }).map((start) => ({ size, value: `bytes=${start}-` })),
    fc.integer({ min: 1, max: size }).chain((start) =>
      fc.integer({ min: 0, max: start - 1 }).map((end) => ({
        size,
        value: `bytes=${start}-${end}`,
      })),
    ),
    fc.constant({ size, value: 'bytes=9007199254740992-' }),
  ),
);

it.prop([unavailableRange], { seed: 0x424f554e, numRuns: 100 })(
  'rejects syntactically valid ranges that are unavailable or exceed safe integer bounds',
  ({ size, value }) => {
    expect(() => parseByteRange(value, size)).toThrow();
  },
);
