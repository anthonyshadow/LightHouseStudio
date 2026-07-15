import { describe, expect, it } from 'vitest';
import { createSafeError } from '../errors/safe-error';
import {
  beginVoiceProcessing,
  completeVoiceProcessing,
  createVoiceProcessingState,
  failVoiceProcessing,
  isPlaybackLocked,
  restoreOriginalVoice,
  selectPlayableArtifact,
} from './index';

describe('immutable-original voice processing', () => {
  it('always retains the same original while replacing successful processed artifacts', () => {
    const original = { id: 'original' };
    const first = beginVoiceProcessing(
      createVoiceProcessingState(original),
      { kind: 'local', effectId: 'warm-studio' },
      'op-1',
    );
    expect(isPlaybackLocked(first)).toBe(true);
    const ready = completeVoiceProcessing(first, 'op-1', { id: 'warm' });
    expect(ready.original).toBe(original);
    expect(selectPlayableArtifact(ready)).toEqual({ id: 'warm' });

    const second = beginVoiceProcessing(ready, { kind: 'local', effectId: 'robot' }, 'op-2');
    expect(second.original).toBe(original);
    expect(second.processed).toEqual({ id: 'warm' });
    const replaced = completeVoiceProcessing(second, 'op-2', { id: 'robot' });
    expect(replaced.original).toBe(original);
    expect(selectPlayableArtifact(replaced)).toEqual({ id: 'robot' });
  });

  it('ignores stale completions and preserves the last valid artifact on failure', () => {
    const ready = completeVoiceProcessing(
      beginVoiceProcessing(
        createVoiceProcessingState({ id: 'original' }),
        { kind: 'local', effectId: 'clear-presenter' },
        'first',
      ),
      'first',
      { id: 'clear' },
    );
    const processing = beginVoiceProcessing(
      ready,
      { kind: 'elevenlabs', voiceId: 'voice-1', voiceName: 'Example' },
      'second',
    );
    expect(completeVoiceProcessing(processing, 'stale', { id: 'stale' })).toBe(processing);
    const failed = failVoiceProcessing(
      processing,
      'second',
      createSafeError('provider-unavailable', 'Voice conversion is temporarily unavailable.'),
    );
    expect(selectPlayableArtifact(failed)).toEqual({ id: 'clear' });
    expect(failed.original).toEqual({ id: 'original' });
  });

  it('restores original immediately for no effect without processing', () => {
    const state = createVoiceProcessingState({ id: 'original' });
    const restored = beginVoiceProcessing(state, { kind: 'none' }, 'unused');
    expect(restored).toEqual(state);
    expect(restoreOriginalVoice(restored).selection.kind).toBe('none');
  });
});
