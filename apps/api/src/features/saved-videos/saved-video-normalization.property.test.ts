import { it } from '@fast-check/vitest';
import fc from 'fast-check';
import { expect } from 'vitest';
import { normalizeSavedVideoTitle } from '@studio/domain';
import { safeSavedVideoFilename } from './saved-video-service.js';

const mimeTypeAndExtension = fc.constantFrom(
  ['video/mp4', '.mp4'] as const,
  ['video/quicktime', '.mov'] as const,
  ['video/webm', '.webm'] as const,
);

it.prop([fc.string()], { seed: 0x5449544c, numRuns: 100 })(
  'normalizes titles idempotently without controls, edge whitespace, or unbounded output',
  (value) => {
    const normalized = normalizeSavedVideoTitle(value);

    expect(normalizeSavedVideoTitle(normalized)).toBe(normalized);
    expect(normalized).toBe(normalized.trim());
    expect(
      [...normalized].every((character) => {
        const codePoint = character.codePointAt(0) ?? 0;
        return codePoint > 31 && codePoint !== 127;
      }),
    ).toBe(true);
    expect(normalized).not.toMatch(/\s{2,}/u);
    expect(normalized.length).toBeGreaterThan(0);
    expect(normalized.length).toBeLessThanOrEqual(120);
  },
);

it.prop([fc.string(), mimeTypeAndExtension], { seed: 0x46494c45, numRuns: 100 })(
  'normalizes filenames to one bounded basename with the authoritative MIME extension',
  (value, [mimeType, extension]) => {
    const normalized = safeSavedVideoFilename(value, mimeType);
    const stem = normalized.slice(0, -extension.length);

    expect(normalized.endsWith(extension)).toBe(true);
    expect(stem.length).toBeGreaterThan(0);
    expect(stem.length).toBeLessThanOrEqual(120);
    expect(stem).toMatch(/^[a-zA-Z0-9._ -]+$/u);
    expect(normalized).not.toContain('/');
    expect(normalized).not.toContain('\\');
  },
);
