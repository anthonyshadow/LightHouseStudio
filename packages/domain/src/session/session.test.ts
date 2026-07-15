import { describe, expect, it } from 'vitest';
import {
  CHARACTER_IMAGE_ONLY_INSTRUCTION,
  CHARACTER_MODEL_ID,
  MAX_IMAGE_BYTES,
  RECOMMENDED_IMAGE_BYTES,
  SESSION_MODES,
  buildRealtimeStateSnapshot,
  canApplyRealtimeChanges,
  canSwitchMode,
  createCleanSessionDraft,
  getImageQualityWarnings,
  hasPendingRealtimeChanges,
  isModelModeId,
  markRealtimeStateApplied,
  revertDraftToAppliedState,
  validateImageDescriptor,
  validateSessionDraft,
  type EphemeralImageDescriptor,
  type SessionDraft,
} from './index';

const image = (overrides: Partial<EphemeralImageDescriptor> = {}): EphemeralImageDescriptor => ({
  id: 'session-image-1',
  name: 'portrait.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 1_000,
  width: 400,
  height: 800,
  ...overrides,
});

describe('session modes and drafts', () => {
  it('keeps local separate and exposes only the two exact provider modes', () => {
    expect(isModelModeId('local')).toBe(false);
    expect(isModelModeId('lucy-2.1')).toBe(false);
    expect(isModelModeId('lucy-2.5')).toBe(true);
    expect(SESSION_MODES.local.kind).toBe('local');
    expect(SESSION_MODES['lucy-2.5'].providerModelId).toBe('lucy-2.5');
    expect(SESSION_MODES['lucy-vton-3'].inputSemantics).toBe('garment');
  });

  it('allows local with no input and blocks an empty model draft', () => {
    expect(validateSessionDraft(createCleanSessionDraft('local'))).toEqual([]);
    expect(validateSessionDraft(createCleanSessionDraft('lucy-2.5'))[0]?.code).toBe(
      'model-input-required',
    );
  });
});

describe('atomic realtime state', () => {
  it('adds the character substitution instruction for image-only Character input', () => {
    const snapshot = buildRealtimeStateSnapshot({
      modeId: CHARACTER_MODEL_ID,
      prompt: '  ',
      image: image(),
      enhancePrompt: false,
    });
    expect(snapshot).toEqual({
      modeId: 'lucy-2.5',
      prompt: CHARACTER_IMAGE_ONLY_INSTRUCTION,
      imageId: 'session-image-1',
      enhancePrompt: false,
    });
  });

  it('does not invent a VTON prompt for image-only input', () => {
    expect(
      buildRealtimeStateSnapshot({
        modeId: 'lucy-vton-3',
        prompt: '',
        image: image(),
        enhancePrompt: false,
      }),
    ).toEqual({
      modeId: 'lucy-vton-3',
      prompt: '',
      imageId: 'session-image-1',
      enhancePrompt: false,
    });
  });

  it('always includes image and enhancement, including explicit image clearing', () => {
    expect(
      buildRealtimeStateSnapshot({
        modeId: 'lucy-2.5',
        prompt: '  chrome explorer  ',
        image: null,
        enhancePrompt: false,
      }),
    ).toEqual({
      modeId: 'lucy-2.5',
      prompt: 'chrome explorer',
      imageId: null,
      enhancePrompt: false,
    });
  });

  it('detects pending changes and can revert locally to the live recipe', () => {
    const draft: SessionDraft = {
      modeId: 'lucy-2.5',
      prompt: 'original',
      image: image(),
      enhancePrompt: false,
    };
    const snapshot = buildRealtimeStateSnapshot(draft);
    expect(snapshot).not.toBeNull();
    const applied = markRealtimeStateApplied(snapshot!, '2026-07-14T10:00:00.000Z');
    expect(hasPendingRealtimeChanges(draft, applied)).toBe(false);
    expect(hasPendingRealtimeChanges({ ...draft, image: null }, applied)).toBe(true);
    expect(revertDraftToAppliedState({ ...draft, prompt: 'pending' }, applied, image())).toEqual(
      draft,
    );
  });
});

describe('image and live-output rules', () => {
  it('accepts exactly 10 MiB and rejects one byte more', () => {
    expect(validateImageDescriptor(image({ sizeBytes: MAX_IMAGE_BYTES }))).toEqual([]);
    expect(validateImageDescriptor(image({ sizeBytes: MAX_IMAGE_BYTES + 1 }))[0]?.code).toBe(
      'image-too-large',
    );
  });

  it('warns about realtime size, weak dimensions and portrait proportions without blocking', () => {
    const warnings = getImageQualityWarnings(
      image({ sizeBytes: RECOMMENDED_IMAGE_BYTES + 1, width: 1_000, height: 300 }),
      'character',
    );
    expect(warnings.map(({ code }) => code)).toEqual([
      'large-image',
      'low-resolution',
      'weak-character-aspect',
    ]);
  });

  it('permits Apply and mode switching only in eligible states', () => {
    expect(
      canApplyRealtimeChanges({
        activeModeId: 'lucy-2.5',
        status: 'generating',
        isApplying: false,
      }),
    ).toBe(true);
    expect(
      canApplyRealtimeChanges({
        activeModeId: 'lucy-2.5',
        status: 'reconnecting',
        isApplying: false,
      }),
    ).toBe(false);
    expect(canSwitchMode('error', false, true)).toBe(false);
    expect(canSwitchMode('disconnected', false, false)).toBe(true);
  });
});
