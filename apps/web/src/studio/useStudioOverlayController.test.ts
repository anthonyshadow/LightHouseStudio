import { describe, expect, it } from 'vitest';
import { studioOverlayReducer } from './useStudioOverlayController';

describe('studioOverlayReducer', () => {
  it('opens, closes, and toggles one overlay at a time', () => {
    expect(studioOverlayReducer(null, { type: 'open', overlay: 'workshop' })).toBe('workshop');
    expect(studioOverlayReducer('workshop', { type: 'toggle', overlay: 'workshop' })).toBeNull();
    expect(studioOverlayReducer('workshop', { type: 'toggle', overlay: 'recipe-shelf' })).toBe(
      'recipe-shelf',
    );
    expect(studioOverlayReducer('recipe-shelf', { type: 'close' })).toBeNull();
  });

  it('supports lifecycle transitions without replacing unrelated overlays', () => {
    expect(studioOverlayReducer(null, { type: 'open-if-empty', overlay: 'take-review' })).toBe(
      'take-review',
    );
    expect(
      studioOverlayReducer('workshop', { type: 'open-if-empty', overlay: 'take-review' }),
    ).toBe('workshop');
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
