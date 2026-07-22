// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { decodeAudioBlob, renderLocalEffect } from './audioEffects';

afterEach(() => vi.unstubAllGlobals());

describe('audio effects', () => {
  it('always closes the decoding context', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const decoded = { duration: 1 } as AudioBuffer;
    class AudioContextMock {
      decodeAudioData = vi.fn().mockResolvedValue(decoded);
      close = close;
    }
    vi.stubGlobal('AudioContext', AudioContextMock);

    await expect(decodeAudioBlob(new Blob(['audio']))).resolves.toBe(decoded);
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes the decoding context when decoding fails', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    class AudioContextMock {
      decodeAudioData = vi.fn().mockRejectedValue(new Error('decode failed'));
      close = close;
    }
    vi.stubGlobal('AudioContext', AudioContextMock);

    await expect(decodeAudioBlob(new Blob(['bad']))).rejects.toThrow('decode failed');
    expect(close).toHaveBeenCalledOnce();
  });

  it.each(['warm-studio', 'clear-presenter', 'robot'] as const)(
    'renders %s and rechecks cancellation after offline rendering',
    async (effect) => {
      const rendered = { duration: 2 } as AudioBuffer;
      const controller = new AbortController();
      const node = () => ({
        connect(target: unknown) {
          return target;
        },
        type: '',
        frequency: { value: 0 },
        gain: { value: 0 },
        Q: { value: 0 },
        threshold: { value: 0 },
        knee: { value: 0 },
        ratio: { value: 0 },
        attack: { value: 0 },
        release: { value: 0 },
        start: vi.fn(),
        stop: vi.fn(),
      });
      class OfflineAudioContextMock {
        destination = node();
        createBufferSource = () => ({ ...node(), buffer: null });
        createBiquadFilter = node;
        createDynamicsCompressor = node;
        createGain = node;
        createOscillator = node;
        startRendering = vi.fn().mockImplementation(() => {
          controller.abort();
          return Promise.resolve(rendered);
        });
      }
      vi.stubGlobal('OfflineAudioContext', OfflineAudioContextMock);
      const original = {
        numberOfChannels: 2,
        length: 48_000,
        sampleRate: 48_000,
        duration: 1,
      } as AudioBuffer;

      await expect(renderLocalEffect(original, effect, controller.signal)).rejects.toMatchObject({
        name: 'AbortError',
      });
    },
  );
});
