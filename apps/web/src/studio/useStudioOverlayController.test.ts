import { describe, expect, it } from 'vitest';
import { studioOverlayReducer } from './useStudioOverlayController';

describe('studioOverlayReducer', () => {
  it('opens, closes, and toggles one overlay at a time', () => {
    expect(studioOverlayReducer(null, { type: 'open', overlay: 'workshop' })).toBe('workshop');
    expect(studioOverlayReducer('workshop', { type: 'toggle', overlay: 'workshop' })).toBeNull();
    expect(studioOverlayReducer('workshop', { type: 'toggle', overlay: 'outfit-selector' })).toBe(
      'outfit-selector',
    );
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
      studioOverlayReducer('workshop', {
        type: 'close-if',
        overlays: ['take-review', 'voice-treatments'],
      }),
    ).toBe('workshop');
  });
});
