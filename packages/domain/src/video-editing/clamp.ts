/** A bounded number; a non-finite input lands on the minimum rather than escaping the bound. */
export const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
