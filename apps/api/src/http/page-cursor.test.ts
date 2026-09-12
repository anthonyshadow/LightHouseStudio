import { describe, expect, it } from 'vitest';
import { projectsResponseSchema } from '@studio/contracts';
import { decodePageCursor, encodePageCursor } from './page-cursor.js';

const shape = {
  timestampKey: 'updatedAt',
  idKey: 'id',
  invalidMessage: 'Use a valid Project page cursor.',
} as const;

const cursor = {
  updatedAt: '2026-08-12T12:00:00.000Z',
  id: '2d7914b2-f912-4b96-b17d-54100a2ffea3',
};

const criteriaFor = (search: string): string =>
  JSON.stringify({ lifecycle: 'archived', campaignId: null, search, pageSize: 40 });

describe('page cursor', () => {
  it('round-trips the page it was minted for and refuses a changed query', () => {
    const criteria = criteriaFor('launch');
    const token = encodePageCursor(cursor, criteria);

    expect(decodePageCursor(token, criteria, shape)).toEqual(cursor);
    expect(() => decodePageCursor(token, criteriaFor('different'), shape)).toThrow(
      shape.invalidMessage,
    );
  });

  it('stays inside the response contract however long the search term is', () => {
    // The search is bounded in characters and the token is built from bytes, so a multi-byte term
    // used to push `nextCursor` past its own cap and the server failed parsing its own reply. The
    // widest inputs the contracts accept: 80 characters of 4-byte emoji, and of 3-byte CJK.
    for (const term of ['🎬'.repeat(80), '漢'.repeat(80), 'a'.repeat(80), '\\'.repeat(80)]) {
      const token = encodePageCursor(cursor, criteriaFor(term));
      expect(() =>
        projectsResponseSchema.parse({
          projects: [],
          nextCursor: token,
          total: { count: 0, exceedsCeiling: false },
        }),
      ).not.toThrow();
      expect(decodePageCursor(token, criteriaFor(term), shape)).toEqual(cursor);
    }
  });

  it('refuses a token minted by the previous envelope', () => {
    const criteria = criteriaFor('launch');
    const legacy = Buffer.from(
      JSON.stringify({ version: 1, ...cursor, criteria }),
      'utf8',
    ).toString('base64url');

    expect(() => decodePageCursor(legacy, criteria, shape)).toThrow(shape.invalidMessage);
  });
});
