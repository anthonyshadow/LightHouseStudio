import { z } from 'zod';

export const toIsoTimestamp = (value: string | Date): string => {
  const timestamp = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    throw new TypeError('Persisted timestamp is invalid.');
  }
  return timestamp.toISOString();
};

const postgresTimestampSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?[+-]\d{2}(?::?\d{2})?$/u);

export const persistedTimestampSchema = z
  .union([z.iso.datetime({ offset: true }), postgresTimestampSchema])
  .transform(toIsoTimestamp);

export const nullableIsoTimestamp = (value: string | Date | null): string | null =>
  value === null ? null : toIsoTimestamp(value);
