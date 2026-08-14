import { createHash } from 'node:crypto';

export const projectRequestFingerprint = (value: unknown): string =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex');
