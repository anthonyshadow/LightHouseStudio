/**
 * The narrowing checks every parser of untrusted input starts from.
 *
 * They live here because each one has exactly one correct definition and three modules had grown
 * their own copy: `isRecord` in particular must exclude arrays, which `typeof value === 'object'`
 * alone does not.
 */

/** A plain object, excluding `null` and arrays. */
export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A string the platform can parse into a real instant. */
export const isTimestamp = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(new Date(value).valueOf());
