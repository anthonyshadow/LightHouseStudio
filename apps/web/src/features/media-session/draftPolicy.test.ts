import { describe, expect, it, vi } from 'vitest';
import { confirmModeReplacement, hasDraftContent } from './draftPolicy';
import { createEmptyDraft } from './types';

describe('mode replacement policy', () => {
  it('switches empty drafts without interruption', () => {
    const confirm = vi.fn();
    expect(confirmModeReplacement(createEmptyDraft('local'), 'lucy-2.5', confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('preserves text drafts without an unnecessary confirmation', () => {
    const draft = { ...createEmptyDraft('lucy-vton-3'), prompt: 'A linen jacket' };
    const confirm = vi.fn().mockReturnValue(false);

    expect(hasDraftContent(draft)).toBe(true);
    expect(confirmModeReplacement(draft, 'lucy-2.5', confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('requires confirmation before switching discards a reference image', () => {
    const file = new File(['image'], 'garment.png', { type: 'image/png' });
    const draft = {
      ...createEmptyDraft('lucy-vton-3'),
      referenceImage: {
        kind: 'ephemeral' as const,
        file,
        previewUrl: 'blob:garment',
      },
    };
    const confirm = vi.fn().mockReturnValue(false);

    expect(confirmModeReplacement(draft, 'lucy-2.5', confirm)).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('does not interrupt actions that stay in the current mode', () => {
    const draft = { ...createEmptyDraft('lucy-2.5'), enhance: true };
    const confirm = vi.fn();
    expect(confirmModeReplacement(draft, 'lucy-2.5', confirm)).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });
});
