import { afterEach, describe, expect, it, vi } from 'vitest';
import { resetVideoDecodeSupportForTests, videoDecoderSupportsConfig } from './videoDecodeSupport';

const hevc = { codec: 'hvc1.1.6.L93.B0', codedWidth: 1_920, codedHeight: 1_080 };

afterEach(() => {
  vi.unstubAllGlobals();
  resetVideoDecodeSupportForTests();
});

describe('videoDecoderSupportsConfig', () => {
  it('answers no where the browser has no WebCodecs at all', async () => {
    await expect(videoDecoderSupportsConfig(hevc)).resolves.toBe(false);
  });

  it('asks the browser about this exact configuration, and remembers the answer per codec', async () => {
    const isConfigSupported = vi.fn((config: VideoDecoderConfig) =>
      Promise.resolve({ supported: config.codec.startsWith('hvc1'), config }),
    );
    vi.stubGlobal('VideoDecoder', { isConfigSupported });

    await expect(videoDecoderSupportsConfig(hevc)).resolves.toBe(true);
    await expect(videoDecoderSupportsConfig(hevc)).resolves.toBe(true);
    // One question per codec: the answer is a property of the browser, and asking is not free.
    expect(isConfigSupported).toHaveBeenCalledTimes(1);
    expect(isConfigSupported).toHaveBeenCalledWith(hevc);

    await expect(videoDecoderSupportsConfig({ ...hevc, codec: 'av01.0.04M.08' })).resolves.toBe(
      false,
    );
    expect(isConfigSupported).toHaveBeenCalledTimes(2);
  });

  it('answers no rather than throwing when the browser refuses the question', async () => {
    vi.stubGlobal('VideoDecoder', {
      isConfigSupported: () => Promise.reject(new TypeError('Unrecognized codec.')),
    });
    await expect(videoDecoderSupportsConfig(hevc)).resolves.toBe(false);
  });

  it('answers no for a configuration that names no codec', async () => {
    vi.stubGlobal('VideoDecoder', {
      isConfigSupported: vi.fn(() => Promise.resolve({ supported: true, config: hevc })),
    });
    await expect(videoDecoderSupportsConfig({ codec: '' })).resolves.toBe(false);
  });
});
