import { describe, expect, it } from 'vitest';
import { decodeCanonicalBase64 } from './strict-base64.js';

describe('decodeCanonicalBase64', () => {
  it('decodes canonical padded and unpadded values', () => {
    expect(decodeCanonicalBase64('aW1hZ2U=', 5)).toEqual({
      ok: true,
      bytes: Buffer.from('image'),
    });
    expect(decodeCanonicalBase64('aW1h', 3)).toEqual({
      ok: true,
      bytes: Buffer.from('ima'),
    });
  });

  it.each(['', 'aW1hZ2U', 'aW1h Z2U=', 'aW1hZ2U_', '===='])(
    'rejects a noncanonical shape: %j',
    (encoded) => {
      expect(decodeCanonicalBase64(encoded, 32)).toEqual({
        ok: false,
        reason: 'shape',
      });
    },
  );

  it('rejects decoded content above the byte limit', () => {
    expect(decodeCanonicalBase64('aW1hZ2U=', 4)).toEqual({
      ok: false,
      reason: 'content',
    });
  });
});
