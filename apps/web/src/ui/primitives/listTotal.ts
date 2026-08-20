import type { ListTotal } from '@studio/contracts';

/**
 * States a bounded total in words, naming the term when one is active.
 *
 * Past the ceiling the count is a floor, and saying so is the whole point: "More than 200 Projects"
 * is true, where the bare number would be a census the list never actually took.
 */
export const listTotalLabel = (
  total: ListTotal,
  singular: string,
  plural: string,
  term?: string,
): string => {
  const counted = total.exceedsCeiling
    ? `More than ${total.count} ${plural}`
    : `${total.count} ${total.count === 1 ? singular : plural}`;
  return term === undefined ? counted : `${counted} matching “${term}”`;
};
