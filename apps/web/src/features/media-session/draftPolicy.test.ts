import { describe, expect, it } from 'vitest';
import { hasDraftContent, modeReplacementNeedsConfirmation } from './draftPolicy';
import { createEmptyDraft } from './types';

describe('mode replacement policy', () => {
  it('switches empty drafts without interruption', () => {
    expect(modeReplacementNeedsConfirmation(createEmptyDraft('local'), 'lucy-latest')).toBe(false);
  });

  it('preserves text drafts without an unnecessary confirmation', () => {
    const draft = { ...createEmptyDraft('lucy-vton-latest'), prompt: 'A linen jacket' };

    expect(hasDraftContent(draft)).toBe(true);
    expect(modeReplacementNeedsConfirmation(draft, 'lucy-latest')).toBe(false);
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

    expect(modeReplacementNeedsConfirmation(draft, 'lucy-latest')).toBe(true);
  });

  it('does not interrupt actions that stay in the current mode', () => {
    const draft = { ...createEmptyDraft('lucy-latest'), enhance: true };
    expect(modeReplacementNeedsConfirmation(draft, 'lucy-latest')).toBe(false);
  });
});
