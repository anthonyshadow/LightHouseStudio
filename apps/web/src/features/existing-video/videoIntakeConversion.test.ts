// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetVideoDecodeSupportForTests } from '../../adapters/media-processing/videoDecodeSupport';

/**
 * The intake's one branch that is not about the file: a codec this product cannot publish, where
 * the browser may or may not be able to convert it here. Both halves are driven with a stubbed
 * media runtime, because the answer under test is the decision, not a decode.
 */
const HEVC_DECODER_CONFIG = { codec: 'hvc1.1.6.L93.B0', codedWidth: 1_280, codedHeight: 720 };

const transcode = vi.hoisted(() => ({ transcodeRecordingToMp4: vi.fn() }));
vi.mock('../../adapters/media-processing/transcodeRecording', () => transcode);

/**
 * A media runtime whose video track states one codec per inspection, in order — so a test says
 * "HEVC on the way in, then what the conversion produced" with one module registration. Two
 * registrations for one module is what made this file flake: which one a dynamic import resolves
 * to is not something a test should be deciding by luck.
 */
const stubMediaRuntime = (...codecs: readonly string[]) => {
  let inspections = 0;
  vi.doMock('mediabunny', () => {
    const MP4 = Symbol('mp4');
    return {
      ALL_FORMATS: [],
      MP4,
      QTFF: Symbol('qtff'),
      WEBM: Symbol('webm'),
      BlobSource: class {},
      Input: class {
        dispose = vi.fn();
        canRead = () => Promise.resolve(true);
        getFormat = () => Promise.resolve(MP4);
        getPrimaryVideoTrack = () => {
          const codec = codecs[Math.min(inspections, codecs.length - 1)]!;
          inspections += 1;
          return Promise.resolve({
            getCodec: () => Promise.resolve(codec),
            getDisplayWidth: () => Promise.resolve(1_280),
            getDisplayHeight: () => Promise.resolve(720),
            getDecoderConfig: () => Promise.resolve(HEVC_DECODER_CONFIG),
          });
        };
        getPrimaryAudioTrack = () => Promise.resolve(null);
        getDurationFromMetadata = () => Promise.resolve(2);
        computeDuration = () => Promise.resolve(2);
      },
    };
  });
};

const file = (name = 'clip.mov') =>
  new File([new Uint8Array(64)], name, { type: 'video/quicktime' });

/**
 * jsdom has no media pipeline, so a `<video>` never reports metadata and the intake's playability
 * check would wait forever. This makes the element answer the one question that check asks.
 */
const installPlayableVideoElement = () => {
  vi.spyOn(window.URL, 'createObjectURL').mockReturnValue('blob:intake');
  vi.spyOn(window.URL, 'revokeObjectURL').mockImplementation(() => undefined);
  // `duration` belongs to the media element; the pixel dimensions belong to the video element.
  Object.defineProperty(HTMLMediaElement.prototype, 'duration', {
    configurable: true,
    get: () => 2,
  });
  for (const [property, value] of [
    ['videoWidth', 1_280],
    ['videoHeight', 720],
  ] as const) {
    Object.defineProperty(HTMLVideoElement.prototype, property, {
      configurable: true,
      get: () => value,
    });
  }
  // Dispatched synchronously from `load()`: the intake attaches its handler before it calls this,
  // so there is nothing to wait for and nothing to race with under a loaded test runner.
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(function (
    this: HTMLMediaElement,
  ) {
    this.dispatchEvent(new Event('loadedmetadata'));
  });
};

beforeEach(() => {
  transcode.transcodeRecordingToMp4.mockReset();
  resetVideoDecodeSupportForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.doUnmock('mediabunny');
  vi.resetModules();
  vi.unstubAllGlobals();
  resetVideoDecodeSupportForTests();
});

describe('intake of a codec this product cannot publish', () => {
  it('converts it here when the browser says it can decode it, and inspects what came back', async () => {
    // HEVC on the way in; whatever the conversion produced is inspected next, and must be H.264.
    stubMediaRuntime('hevc', 'avc');
    vi.stubGlobal('VideoDecoder', {
      isConfigSupported: vi.fn(() =>
        Promise.resolve({ supported: true, config: HEVC_DECODER_CONFIG }),
      ),
    });
    installPlayableVideoElement();
    transcode.transcodeRecordingToMp4.mockResolvedValue({
      blob: new Blob([new Uint8Array(32)], { type: 'video/mp4' }),
      mimeType: 'video/mp4',
    });
    const { validateExistingVideo } = await import('./videoValidation');
    const onConvert = vi.fn();

    const validated = await validateExistingVideo(
      file(),
      false,
      new AbortController().signal,
      'source',
      { onConvert },
    );

    expect(transcode.transcodeRecordingToMp4).toHaveBeenCalledTimes(1);
    // The surface is told, because the wait is long enough to need explaining.
    expect(onConvert).toHaveBeenCalledTimes(1);
    expect(validated.metadata.videoCodec).toBe('avc');
    // The same name, said as the MP4 the conversion produced.
    expect(validated.file.name).toBe('clip.mp4');
    expect(validated.mimeType).toBe('video/mp4');
  });

  it('refuses it, saying this browser cannot convert it either, and converts nothing', async () => {
    stubMediaRuntime('hevc');
    vi.stubGlobal('VideoDecoder', {
      isConfigSupported: vi.fn(() =>
        Promise.resolve({ supported: false, config: HEVC_DECODER_CONFIG }),
      ),
    });
    const { validateExistingVideo } = await import('./videoValidation');

    await expect(
      validateExistingVideo(file(), false, new AbortController().signal),
    ).rejects.toThrow(/cannot convert it either/u);
    expect(transcode.transcodeRecordingToMp4).not.toHaveBeenCalled();
  });

  it('never converts a file the server has already approved', async () => {
    stubMediaRuntime('hevc');
    vi.stubGlobal('VideoDecoder', {
      isConfigSupported: vi.fn(() =>
        Promise.resolve({ supported: true, config: HEVC_DECODER_CONFIG }),
      ),
    });
    const { validateExistingVideo } = await import('./videoValidation');

    await expect(
      validateExistingVideo(file(), false, new AbortController().signal, 'server-approved-result'),
    ).rejects.toThrow(/HEVC and ProRes are not qualified/u);
    expect(transcode.transcodeRecordingToMp4).not.toHaveBeenCalled();
  });
});
