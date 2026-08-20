import { LIST_TOTAL_CEILING, type ListTotal } from '@studio/contracts';

/**
 * How many rows a repository reads when all it has to answer is "how many match?".
 *
 * One row past the ceiling is enough to know the ceiling was passed, and nothing beyond that is
 * ever read: a list says "more than N" rather than paying for a census it would not display.
 */
export const LIST_TOTAL_PROBE_LIMIT = LIST_TOTAL_CEILING + 1;

/**
 * Turns a match count into the bounded total a list reports.
 *
 * The count may be exact — where the records were already in memory, counting them costs nothing —
 * or capped by the caller at {@link LIST_TOTAL_PROBE_LIMIT}. Either way the answer past the
 * ceiling is the same, so the two persistence implementations stay indistinguishable.
 */
export const boundedListTotal = (matched: number): ListTotal =>
  matched > LIST_TOTAL_CEILING
    ? { count: LIST_TOTAL_CEILING, exceedsCeiling: true }
    : { count: matched, exceedsCeiling: false };
