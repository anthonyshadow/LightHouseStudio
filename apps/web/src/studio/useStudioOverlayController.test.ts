import { describe, expect, it } from 'vitest';
import { studioOverlayReducer } from './useStudioOverlayController';

describe('studioOverlayReducer', () => {
  it('opens, closes, and toggles one overlay at a time', () => {
    expect(studioOverlayReducer(null, { type: 'open', overlay: 'ai-settings' })).toBe(
      'ai-settings',
    );
    expect(
      studioOverlayReducer('ai-settings', { type: 'toggle', overlay: 'ai-settings' }),
    ).toBeNull();
    expect(
      studioOverlayReducer('ai-settings', { type: 'toggle', overlay: 'outfit-selector' }),
    ).toBe('outfit-selector');
    expect(studioOverlayReducer('outfit-selector', { type: 'close' })).toBeNull();
  });

  it('closes lifecycle-owned overlays without replacing unrelated overlays', () => {
    expect(
      studioOverlayReducer('take-review', {
        type: 'close-if',
        overlays: ['take-review', 'voice-treatments'],
      }),
    ).toBeNull();
    expect(
      studioOverlayReducer('ai-settings', {
        type: 'close-if',
        overlays: ['take-review', 'voice-treatments'],
      }),
    ).toBe('ai-settings');
  });
});
