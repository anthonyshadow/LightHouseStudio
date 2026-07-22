// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const media = vi.hoisted(() => ({
  buffer: null as ArrayBuffer | null,
  canEncode: true,
  cancel: vi.fn(),
  dispose: vi.fn(),
  finalize: vi.fn(),
  outputState: 'pending',
}));

vi.mock('./audioEffects', () => ({
  decodeAudioBlob: vi.fn().mockResolvedValue({ numberOfChannels: 2, sampleRate: 48_000 }),
}));

vi.mock('mediabunny', () => {
  class Input {
    getPrimaryVideoTrack = vi.fn().mockResolvedValue({
      getCodec: vi.fn().mockResolvedValue('vp9'),
      getDecoderConfig: vi.fn().mockResolvedValue({ codec: 'vp09' }),
    });
    dispose = media.dispose;
  }
  class BufferTarget {
    get buffer() {
      return media.buffer;
    }
  }
  class Output {
    get state() {
      return media.outputState;
    }
    addVideoTrack = vi.fn();
    addAudioTrack = vi.fn();
    start = vi.fn().mockImplementation(() => {
      media.outputState = 'started';
    });
    getMimeType = vi.fn().mockResolvedValue('video/webm');
    finalize = media.finalize;
    cancel = media.cancel;
  }
  class PacketSource {
    add = vi.fn();
    close = vi.fn();
  }
  class PacketSink {
    async *packets() {
      await Promise.resolve();
      yield { timestamp: 0 };
    }
  }
  return {
    ALL_FORMATS: [],
    AudioBufferSource: PacketSource,
    BlobSource: class {},
    BufferTarget,
    EncodedPacketSink: PacketSink,
    EncodedVideoPacketSource: PacketSource,
    Input,
    Mp4OutputFormat: class {},
    Output,
    WebMOutputFormat: class {},
    canEncodeAudio: vi.fn(() => Promise.resolve(media.canEncode)),
  };
});

import { replaceRecordingAudio } from './replaceAudioTrack';

beforeEach(() => {
  vi.stubGlobal('AudioBuffer', class AudioBufferMock {});
  media.buffer = new Uint8Array([1, 2, 3]).buffer;
  media.canEncode = true;
  media.outputState = 'pending';
  media.cancel.mockReset().mockResolvedValue(undefined);
  media.dispose.mockReset();
  media.finalize.mockReset().mockResolvedValue(undefined);
});

describe('replaceRecordingAudio', () => {
  it('remuxes replacement audio and always disposes the input', async () => {
    const result = await replaceRecordingAudio(
      new Blob(['video'], { type: 'video/webm' }),
      new Blob(['audio'], { type: 'audio/webm' }),
      new AbortController().signal,
    );

    expect(result.mimeType).toBe('video/webm');
    expect(result.blob.size).toBe(3);
    expect(media.finalize).toHaveBeenCalledOnce();
    expect(media.dispose).toHaveBeenCalledOnce();
    expect(media.cancel).not.toHaveBeenCalled();
  });

  it('cancels started output and disposes input after finalization failure', async () => {
    media.finalize.mockRejectedValueOnce(new Error('mux failed'));

    await expect(
      replaceRecordingAudio(
        new Blob(['video'], { type: 'video/webm' }),
        new Blob(['audio'], { type: 'audio/webm' }),
        new AbortController().signal,
      ),
    ).rejects.toThrow('mux failed');
    expect(media.cancel).toHaveBeenCalledOnce();
    expect(media.dispose).toHaveBeenCalledOnce();
  });

  it('rejects unsupported encoding before starting output and still disposes input', async () => {
    media.canEncode = false;

    await expect(
      replaceRecordingAudio(
        new Blob(['video'], { type: 'video/mp4' }),
        new Blob(['audio'], { type: 'audio/webm' }),
        new AbortController().signal,
      ),
    ).rejects.toThrow('cannot encode AAC audio');
    expect(media.cancel).not.toHaveBeenCalled();
    expect(media.dispose).toHaveBeenCalledOnce();
  });
});
