import { describe, expect, it, vi } from 'vitest';
import { canReplaceDirtyLibraryMode, shouldFinalizeForUnusableModelOutput } from './studioPolicies';

describe('studio transition policies', () => {
  it('protects an unsaved recipe form before changing model shelves', () => {
    const confirmDiscard = vi.fn().mockReturnValue(false);
    expect(canReplaceDirtyLibraryMode(true, confirmDiscard)).toBe(false);
    expect(confirmDiscard).toHaveBeenCalledOnce();
    expect(canReplaceDirtyLibraryMode(false, confirmDiscard)).toBe(true);
    expect(confirmDiscard).toHaveBeenCalledOnce();
  });

  it('finalizes a model take when transformed video becomes unusable', () => {
    expect(shouldFinalizeForUnusableModelOutput('recording', 'lucy-2.5', false)).toBe(true);
    expect(shouldFinalizeForUnusableModelOutput('recording', 'local', false)).toBe(false);
    expect(shouldFinalizeForUnusableModelOutput('recording', 'lucy-vton-3', true)).toBe(false);
    expect(shouldFinalizeForUnusableModelOutput('recorded', 'lucy-2.5', false)).toBe(false);
  });
});
