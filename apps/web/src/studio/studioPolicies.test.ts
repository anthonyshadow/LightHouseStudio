import { describe, expect, it } from 'vitest';
import { shouldFinalizeForUnusableModelOutput } from './studioPolicies';

describe('studio transition policies', () => {
  it('finalizes a model take when transformed video becomes unusable', () => {
    expect(shouldFinalizeForUnusableModelOutput('recording', 'lucy-latest', false)).toBe(true);
    expect(shouldFinalizeForUnusableModelOutput('recording', 'local', false)).toBe(false);
    expect(shouldFinalizeForUnusableModelOutput('recording', 'lucy-vton-latest', true)).toBe(false);
    expect(shouldFinalizeForUnusableModelOutput('recorded', 'lucy-latest', false)).toBe(false);
  });
});
