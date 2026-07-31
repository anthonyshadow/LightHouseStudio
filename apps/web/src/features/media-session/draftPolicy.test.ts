import { describe, expect, it, vi } from 'vitest';
import { confirmModeReplacement, hasDraftContent } from './draftPolicy';
import { createEmptyDraft } from './types';

describe('mode replacement policy', () => {
  it('switches empty drafts without interruption', () => {
    const confirm = vi.fn();
    expect(confirmModeReplacement(createEmptyDraft('local'), 'lucy-latest', confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('preserves text drafts without an unnecessary confirmation', () => {
    const draft = { ...createEmptyDraft('lucy-vton-latest'), prompt: 'A linen jacket' };
    const confirm = vi.fn().mockReturnValue(false);

    expect(hasDraftContent(draft)).toBe(true);
    expect(confirmModeReplacement(draft, 'lucy-latest', confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('requires confirmation before switching discards a reference image', () => {
    const file = new File(['image'], 'garment.png', { type: 'image/png' });
    const draft = {
      ...createEmptyDraft('lucy-vton-latest'),
      referenceImage: {
        kind: 'ephemeral' as const,
        file,
        previewUrl: 'blob:garment',
      },
    };
    const confirm = vi.fn().mockReturnValue(false);

    expect(confirmModeReplacement(draft, 'lucy-latest', confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('does not interrupt actions that stay in the current mode', () => {
    const draft = { ...createEmptyDraft('lucy-latest'), enhance: true };
    const confirm = vi.fn();
    expect(confirmModeReplacement(draft, 'lucy-latest', confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
