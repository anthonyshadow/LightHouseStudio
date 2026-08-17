import { createHash } from 'node:crypto';

/**
 * The single owner of the id-stability contract behind idempotent replay.
 *
 * A retried operation must resolve to the *same* row id so the replay is recognised rather than
 * duplicated, which means the id has to be a pure function of the operation's identity. The byte
 * layout below (SHA-256, truncated to 16 bytes, stamped with the UUIDv5 version nibble and the
 * RFC 4122 variant bits) is load-bearing: changing it would produce different ids for operations
 * that already have rows, so callers must keep their `name` namespaces stable too.
 */
export const deterministicUuid = (name: string): string => {
  const bytes = createHash('sha256').update(name).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};
