// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import type { SessionDraft } from '../../features/media-session';
import {
  hasPendingChanges,
  imageIdentity,
  normalizePrompt,
  revertToAppliedDraft,
  toAppliedState,
  toProviderSnapshot,
  validateModelDraft,
} from './realtimeSnapshot';

const draft = (overrides: Partial<SessionDraft> = {}): SessionDraft => ({
  mode: 'lucy-2.5',
  prompt: '',
  referenceImage: null,
  enhance: false,
  ...overrides,
});

const ephemeral = (file: File) => ({
  kind: 'ephemeral' as const,
  file,
  previewUrl: `blob:${file.name}`,
});

describe('realtime state snapshots', () => {
  it('rejects an empty model draft while allowing local preparation', () => {
    expect(validateModelDraft(draft())).toMatch(/prompt, a reference image, or both/i);
    expect(validateModelDraft(draft({ mode: 'lucy-vton-3', prompt: '   ' }))).toMatch(
      /before starting AI/i,
    );
    expect(validateModelDraft(draft({ mode: 'local' }))).toBeNull();
  });

  it('trims prompt boundaries, preserves authored formatting, and emits one atomic payload', () => {
    expect(normalizePrompt('  Keep   the  expression\ncalm  ')).toBe(
      'Keep   the  expression\ncalm',
    );

    const snapshot = toProviderSnapshot(
      'lucy-2.5',
      draft({ prompt: '  Keep   the  expression calm ', enhance: true, referenceImage: null }),
    );

    expect(snapshot).toEqual({
      prompt: 'Keep   the  expression calm',
      image: null,
      enhance: true,
    });
    expect(Object.keys(snapshot).sort()).toEqual(['enhance', 'image', 'prompt']);
  });

  it('adds the functional Lucy 2.5 instruction for portrait-only input', () => {
    const portrait = new File(['portrait'], 'portrait.webp', {
      type: 'image/webp',
      lastModified: 1_720_955_200_000,
    });

    expect(toProviderSnapshot('lucy-2.5', draft({ referenceImage: ephemeral(portrait) }))).toEqual({
      prompt:
        'Transform the subject using the provided portrait as the character identity while preserving recognizable facial features.',
      image: portrait,
      enhance: false,
    });
  });

  it('reverts a portrait-only provider instruction to the empty authored prompt', () => {
    const portrait = new File(['portrait'], 'portrait.webp', { type: 'image/webp' });
    const initial = draft({ referenceImage: ephemeral(portrait) });
    const applied = toAppliedState(initial);

    expect(revertToAppliedDraft({ ...initial, prompt: 'pending edit' }, applied)).toMatchObject({
      prompt: '',
      referenceImage: expect.objectContaining({ file: portrait }),
      enhance: false,
    });
  });

  it('does not invent prompt text for VTON image-only input', () => {
    const garment = new File(['garment'], 'jacket.png', {
      type: 'image/png',
      lastModified: 1_720_955_200_000,
    });

    expect(
      toProviderSnapshot(
        'lucy-vton-3',
        draft({ mode: 'lucy-vton-3', referenceImage: ephemeral(garment) }),
      ),
    ).toEqual({
      prompt: '',
      image: garment,
      enhance: false,
    });
  });

  it('detects prompt, enhancement, replacement, and explicit image-clear changes', () => {
    const portrait = new File(['portrait'], 'portrait.jpg', {
      type: 'image/jpeg',
      lastModified: 100,
    });
    const initial = draft({ prompt: 'Explorer', referenceImage: ephemeral(portrait) });
    const applied = toAppliedState(initial);

    expect(imageIdentity(portrait)).toMatch(
      new RegExp(`^portrait\\.jpg:image/jpeg:${portrait.size}:100#\\d+$`),
    );
    expect(hasPendingChanges(initial, applied)).toBe(false);
    expect(hasPendingChanges({ ...initial, prompt: 'Explorer in copper' }, applied)).toBe(true);
    expect(hasPendingChanges({ ...initial, enhance: true }, applied)).toBe(true);
    expect(hasPendingChanges({ ...initial, referenceImage: null }, applied)).toBe(true);
    expect(toProviderSnapshot('lucy-2.5', { ...initial, referenceImage: null }).image).toBeNull();
  });

  it('treats distinct image objects as replacements even when browser metadata matches', () => {
    const metadata = { type: 'image/png', lastModified: 100 };
    const first = new File(['first'], 'portrait.png', metadata);
    const replacement = new File(['other'], 'portrait.png', metadata);
    const initial = draft({ referenceImage: ephemeral(first) });

    expect(first.size).toBe(replacement.size);
    expect(imageIdentity(first)).not.toBe(imageIdentity(replacement));
    expect(
      hasPendingChanges(
        { ...initial, referenceImage: ephemeral(replacement) },
        toAppliedState(initial),
      ),
    ).toBe(true);
  });

  it('uses the asset ID as persisted identity across separately hydrated File objects', () => {
    const first = new File(['same'], 'reference.jpg', { type: 'image/jpeg' });
    const hydratedAgain = new File(['same'], 'reference.jpg', { type: 'image/jpeg' });
    const assetId = '550e8400-e29b-41d4-a716-446655440000';
    const initial = draft({
      referenceImage: {
        kind: 'persisted',
        assetId,
        file: first,
        contentUrl: `/api/reference-images/${assetId}/content`,
      },
    });

    expect(
      hasPendingChanges(
        {
          ...initial,
          referenceImage: {
            kind: 'persisted',
            assetId,
            file: hydratedAgain,
            contentUrl: `/api/reference-images/${assetId}/content`,
          },
        },
        toAppliedState(initial),
      ),
    ).toBe(false);
  });
});
