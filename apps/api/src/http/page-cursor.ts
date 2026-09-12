import { createHash } from 'node:crypto';
import { AppError } from './app-error.js';

const CURSOR_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/**
 * The sealed criteria, as a fixed-width digest rather than the criteria themselves.
 *
 * Nothing ever reads them back — they are only compared for equality — and carrying them verbatim
 * made the token's length track the caller's search text. A search is bounded in characters while
 * the token is built from bytes, so an 80-character CJK term produced a cursor longer than the
 * response contract's own `nextCursor` cap, and the server failed parsing its own reply.
 */
export const sealedCriteria = (criteria: string): string =>
  createHash('sha256').update(criteria, 'utf8').digest('base64url');

/**
 * The single owner of the opaque page-cursor envelope.
 *
 * A cursor is only meaningful for the exact query that produced it, so the criteria the caller
 * paged by are sealed inside the token and re-checked on decode: a client that changes its filter
 * or page size mid-pagination gets one finite validation error rather than a silently shifted page.
 * The envelope version guards the same way against tokens minted by an older shape.
 */
export type PageCursorShape<TimestampKey extends string, IdKey extends string> = Readonly<{
  timestampKey: TimestampKey;
  idKey: IdKey;
  invalidMessage: string;
}>;

export type DecodedPageCursor<TimestampKey extends string, IdKey extends string> = Record<
  TimestampKey,
  string
> &
  Record<IdKey, string>;

export const encodePageCursor = (cursor: object, criteria: string): string =>
  Buffer.from(
    JSON.stringify({ version: 2, ...cursor, criteria: sealedCriteria(criteria) }),
    'utf8',
  ).toString('base64url');

export const decodePageCursor = <TimestampKey extends string, IdKey extends string>(
  token: string | undefined,
  criteria: string,
  shape: PageCursorShape<TimestampKey, IdKey>,
): DecodedPageCursor<TimestampKey, IdKey> | undefined => {
  if (token === undefined) return undefined;
  try {
    const value = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as unknown;
    if (typeof value === 'object' && value !== null) {
      const record = value as Record<string, unknown>;
      const timestamp = record[shape.timestampKey];
      const id = record[shape.idKey];
      if (
        record['version'] === 2 &&
        typeof timestamp === 'string' &&
        Number.isFinite(new Date(timestamp).valueOf()) &&
        typeof id === 'string' &&
        CURSOR_UUID_PATTERN.test(id) &&
        record['criteria'] === sealedCriteria(criteria)
      ) {
        return {
          [shape.timestampKey]: new Date(timestamp).toISOString(),
          [shape.idKey]: id,
        } as DecodedPageCursor<TimestampKey, IdKey>;
      }
    }
  } catch {
    // Opaque application cursors fail as one finite validation error.
  }
  throw new AppError(400, 'validation_error', shape.invalidMessage);
};
