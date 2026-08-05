// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const media = vi.hoisted(() => {
  const videoTrack = {
    kind: 'video',
    getCodec: vi.fn().mockResolvedValue('avc'),
    getDisplayWidth: vi.fn().mockResolvedValue(1_280),
    getDisplayHeight: vi.fn().mockResolvedValue(720),
  };
  const audioTrack = { kind: 'audio', getCodec: vi.fn().mockResolvedValue('aac') };
  const initialBuffer = (): ArrayBuffer | null => new Uint8Array([1, 2, 3]).buffer;
  const initialOptions = (): unknown => null;
  return {
    audioTrack,
    buffer: initialBuffer(),
    canEncodeAudio: true,
    canEncodeVideo: true,
    cancel: vi.fn(),
    conversionOptions: initialOptions(),
    dispose: vi.fn(),
    execute: vi.fn(),
    getMimeType: vi.fn(),
    includeAudio: true,
    isValid: true,
    outputOptions: initialOptions(),
    registerAacEncoder: vi.fn(),
    retainAudio: true,
    videoTrack,
  };
});

vi.mock('@mediabunny/aac-encoder', () => ({
  registerAacEncoder: media.registerAacEncoder,
}));

vi.mock('mediabunny', () => {
  const MP4 = { name: 'mp4' };
  class Input {
    getPrimaryVideoTrack = vi.fn().mockResolvedValue(media.videoTrack);
    getPrimaryAudioTrack = vi
      .fn()
      .mockImplementation(() => Promise.resolve(media.includeAudio ? media.audioTrack : null));
    canRead = vi.fn().mockResolvedValue(true);
    getFormat = vi.fn().mockResolvedValue(MP4);
    getDurationFromMetadata = vi.fn().mockResolvedValue(1);
    computeDuration = vi.fn().mockResolvedValue(1);
    dispose = media.dispose;
  }
  class BufferTarget {
    get buffer() {
      return media.buffer;
    }
  }
  class Output {
    constructor(options: unknown) {
      media.outputOptions = options;
    }
    getMimeType = media.getMimeType;
  }
  class Conversion {
    state: 'idle' | 'executing' | 'canceled' | 'done' = 'idle';
    isValid = media.isValid;
    utilizedTracks =
      media.includeAudio && media.retainAudio
        ? [media.videoTrack, media.audioTrack]
        : [media.videoTrack];

    static init = vi.fn((options: unknown) => {
      media.conversionOptions = options;
      return Promise.resolve(new Conversion());
    });

    execute = vi.fn(async () => {
      this.state = 'executing';
      await media.execute();
      this.state = 'done';
    });

    cancel = vi.fn(async () => {
      this.state = 'canceled';
      await media.cancel();
    });
  }

  return {
    ALL_FORMATS: [],
    BlobSource: class {},
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat: class {
      constructor(readonly options: unknown) {}
    },
    MP4,
    Output,
    canEncodeAudio: vi.fn(() => Promise.resolve(media.canEncodeAudio)),
    canEncodeVideo: vi.fn(() => Promise.resolve(media.canEncodeVideo)),
  };
});

import { transcodeRecordingToMp4 } from './transcodeRecording';

beforeEach(() => {
  media.buffer = new Uint8Array([1, 2, 3]).buffer;
  media.canEncodeAudio = true;
  media.canEncodeVideo = true;
  media.cancel.mockReset().mockResolvedValue(undefined);
  media.conversionOptions = null;
  media.dispose.mockReset();
  media.execute.mockReset().mockResolvedValue(undefined);
  media.getMimeType.mockReset().mockResolvedValue('video/mp4; codecs="avc1,mp4a"');
  media.includeAudio = true;
  media.isValid = true;
  media.outputOptions = null;
  media.registerAacEncoder.mockReset();
  media.retainAudio = true;
  media.videoTrack.getCodec.mockReset().mockResolvedValue('avc');
  media.audioTrack.getCodec.mockReset().mockResolvedValue('aac');
});

describe('transcodeRecordingToMp4', () => {
  it('copies matching primary H.264/AAC tracks into the normalized MP4', async () => {
    const result = await transcodeRecordingToMp4(new Blob(['recorded'], { type: 'video/webm' }), {
      requireAudio: true,
      signal: new AbortController().signal,
    });

    expect(result.mimeType).toBe('video/mp4');
    expect(result.blob.type).toBe('video/mp4');
    expect(result.blob.size).toBe(3);
    expect(media.conversionOptions).toMatchObject({
      tracks: 'primary',
      video: {
        codec: 'avc',
        forceTranscode: false,
        hardwareAcceleration: 'no-preference',
      },
      audio: { codec: 'aac', forceTranscode: false },
      tags: {},
      showWarnings: false,
    });
    expect(media.outputOptions).toMatchObject({
      format: { options: { fastStart: false } },
    });
    expect(media.dispose).toHaveBeenCalledTimes(2);
    expect(media.cancel).not.toHaveBeenCalled();
  });

  it('transcodes non-H.264/non-AAC source tracks before publishing', async () => {
    media.videoTrack.getCodec.mockResolvedValueOnce('vp8').mockResolvedValue('avc');
    media.audioTrack.getCodec.mockResolvedValueOnce('opus').mockResolvedValue('aac');

    await transcodeRecordingToMp4(new Blob(['recorded'], { type: 'video/webm' }), {
      requireAudio: true,
      signal: new AbortController().signal,
    });

    expect(media.conversionOptions).toMatchObject({
      video: { codec: 'avc', forceTranscode: true },
      audio: { codec: 'aac', forceTranscode: true },
    });
  });

  it('registers MediaBunny AAC fallback support when the browser lacks a native encoder', async () => {
    media.audioTrack.getCodec.mockResolvedValueOnce('opus').mockResolvedValue('aac');
    media.canEncodeAudio = false;
    media.registerAacEncoder.mockImplementation(() => {
      media.canEncodeAudio = true;
    });

    await transcodeRecordingToMp4(new Blob(['recorded'], { type: 'video/webm' }), {
      requireAudio: true,
      signal: new AbortController().signal,
    });

    expect(media.registerAacEncoder).toHaveBeenCalledOnce();
    expect(media.dispose).toHaveBeenCalledTimes(2);
  });

  it('rejects instead of returning an unconverted file when H.264 encoding is unavailable', async () => {
    media.videoTrack.getCodec.mockResolvedValueOnce('vp8').mockResolvedValue('avc');
    media.canEncodeVideo = false;

    await expect(
      transcodeRecordingToMp4(new Blob(['recorded'], { type: 'video/webm' }), {
        requireAudio: true,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('cannot encode H.264 video');
    expect(media.dispose).toHaveBeenCalledOnce();
  });

  it('rejects instead of silently dropping recorded audio', async () => {
    media.retainAudio = false;

    await expect(
      transcodeRecordingToMp4(new Blob(['recorded'], { type: 'video/webm' }), {
        requireAudio: true,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('without dropping video or audio');
    expect(media.cancel).toHaveBeenCalledOnce();
    expect(media.dispose).toHaveBeenCalledOnce();
  });

  it('rejects when a capture with audio produces no primary audio track', async () => {
    media.includeAudio = false;

    await expect(
      transcodeRecordingToMp4(new Blob(['recorded'], { type: 'video/webm' }), {
        requireAudio: true,
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('missing its captured audio track');
    expect(media.dispose).toHaveBeenCalledOnce();
  });

  it('cancels conversion and disposes input when the owner aborts', async () => {
    const controller = new AbortController();
    let markExecuteStarted!: () => void;
    const executeStarted = new Promise<void>((resolve) => {
      markExecuteStarted = resolve;
    });
    media.execute.mockImplementation(() => {
      markExecuteStarted();
      return new Promise<void>((_resolve, reject) => {
        controller.signal.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    });

    const transcoding = transcodeRecordingToMp4(new Blob(['recorded'], { type: 'video/webm' }), {
      requireAudio: true,
      signal: controller.signal,
    });
    await executeStarted;
    controller.abort();

    await expect(transcoding).rejects.toMatchObject({ name: 'AbortError' });
    expect(media.cancel).toHaveBeenCalledOnce();
    expect(media.dispose).toHaveBeenCalledOnce();
  });
});
