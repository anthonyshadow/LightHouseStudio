import { LIST_TOTAL_CEILING } from '@studio/contracts';
import { describe, expect, it } from 'vitest';
import { boundedListTotal, LIST_TOTAL_PROBE_LIMIT } from './list-total.js';

describe('Bounded list totals', () => {
  it('reports an exact count up to the ceiling', () => {
    expect(boundedListTotal(0)).toEqual({ count: 0, exceedsCeiling: false });
    expect(boundedListTotal(7)).toEqual({ count: 7, exceedsCeiling: false });
    expect(boundedListTotal(LIST_TOTAL_CEILING)).toEqual({
      count: LIST_TOTAL_CEILING,
      exceedsCeiling: false,
    });
  });

  it('reports a floor past the ceiling, so no surface can state a census that was never taken', () => {
    expect(boundedListTotal(LIST_TOTAL_CEILING + 1)).toEqual({
      count: LIST_TOTAL_CEILING,
      exceedsCeiling: true,
    });
    // Whatever a repository saw beyond the probe limit, the answer it reports is the same. This is
    // what lets an exact in-memory count and a `LIMIT`-ed database probe stay indistinguishable.
    expect(boundedListTotal(LIST_TOTAL_PROBE_LIMIT)).toEqual(boundedListTotal(50_000));
  });
});
