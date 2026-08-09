import { AppError } from '../../http/app-error.js';

export interface ByteRange {
  readonly start: number;
  readonly end: number;
}

export const parseByteRange = (value: string | undefined, size: number): ByteRange | null => {
  if (value === undefined) return null;
  const match = /^bytes=(\d+)-(\d*)$/u.exec(value);
  if (match === null) throw new AppError(416, 'validation_error', 'Use a valid byte range.');
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  const end = Math.min(requestedEnd, size - 1);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  ) {
    throw new AppError(416, 'validation_error', 'The requested byte range is unavailable.');
  }
  return { start, end };
};

export const contentRangeHeaders = (
  range: ByteRange,
  size: number,
): Readonly<{ contentRange: string; contentLength: number }> => ({
  contentRange: `bytes ${range.start}-${range.end}/${size}`,
  contentLength: range.end - range.start + 1,
});
