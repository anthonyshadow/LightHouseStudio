/**
 * Display formatting for timestamps. The `Intl.DateTimeFormat` instances are built once per
 * process — constructing one per call is the expensive part of formatting a date.
 */
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

/** e.g. `16 Aug 2026` */
export const formatDate = (value: string | number | Date): string =>
  dateFormatter.format(new Date(value));

/** e.g. `16 Aug 2026, 14:05` */
export const formatDateTime = (value: string | number | Date): string =>
  dateTimeFormatter.format(new Date(value));
