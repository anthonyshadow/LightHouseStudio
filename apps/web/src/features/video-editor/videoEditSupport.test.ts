// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetVideoEditExportSupportForTests,
  videoEditExportSupported,
  videoEditPreviewSupported,
} from './videoEditSupport';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('videoEditPreviewSupported', () => {
  it('releases the temporary WebGL capability-probe context', () => {
    const loseContext = vi.fn();
    const gl = {
      getExtension: vi.fn().mockReturnValue({ loseContext }),
    } as unknown as WebGLRenderingContext;
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl);

    expect(videoEditPreviewSupported()).toBe(true);
    expect(gl.getExtension).toHaveBeenCalledWith('WEBGL_lose_context');
    expect(loseContext).toHaveBeenCalledOnce();
  });

  it('answers no where the browser gives no WebGL context', () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    expect(videoEditPreviewSupported()).toBe(false);
  });
});

/**
 * A fake `VideoEncoder` that reports whatever support it is told to, and then either produces a
 * chunk, reports an error, or accepts the frame and quietly produces nothing — the three ways a
 * browser answers this question, only one of which means the editor can save anything.
 */
const encoderClass = (behaviour: 'chunk' | 'error' | 'silence') => {
  class FakeVideoEncoder {
    static configSupported = true;
    static configured: VideoEncoderConfig | null = null;
    static closed = 0;

    state: 'unconfigured' | 'configured' | 'closed' = 'unconfigured';

    constructor(private readonly callbacks: { output: () => void; error: () => void }) {}

    static isConfigSupported(config: VideoEncoderConfig) {
      FakeVideoEncoder.configured = config;
      return Promise.resolve({ supported: FakeVideoEncoder.configSupported, config });
    }

    configure(): void {
      this.state = 'configured';
    }

    encode(): void {
      if (behaviour === 'chunk') this.callbacks.output();
      if (behaviour === 'error') this.callbacks.error();
    }

    flush(): Promise<void> {
      return Promise.resolve();
    }

    close(): void {
      this.state = 'closed';
      FakeVideoEncoder.closed += 1;
    }
  }
  return FakeVideoEncoder;
};

const stubWebCodecs = (encoder: ReturnType<typeof encoderClass>) => {
  vi.stubGlobal('Worker', class {});
  vi.stubGlobal(
    'OffscreenCanvas',
    class {
      getContext() {
        return { fillRect: () => {} };
      }
    },
  );
  vi.stubGlobal('VideoDecoder', class {});
  vi.stubGlobal('VideoEncoder', encoder);
  vi.stubGlobal(
    'VideoFrame',
    class {
      close(): void {}
    },
  );
};

describe('videoEditExportSupported', () => {
  beforeEach(() => resetVideoEditExportSupportForTests());

  it('answers no when the browser is missing the classes an export needs', async () => {
    await expect(videoEditExportSupported()).resolves.toBe(false);
  });

  it('asks the encoder for the profile MediaBunny will ask it for', async () => {
    const encoder = encoderClass('chunk');
    stubWebCodecs(encoder);

    await expect(videoEditExportSupported()).resolves.toBe(true);
    expect(encoder.configured).toMatchObject({ codec: 'avc1.64001f', width: 1_280, height: 720 });
    expect(encoder.closed).toBe(1);
  });

  it('answers no when the encoder declines the configuration', async () => {
    const encoder = encoderClass('chunk');
    encoder.configSupported = false;
    stubWebCodecs(encoder);

    await expect(videoEditExportSupported()).resolves.toBe(false);
  });

  /*
   * The case the presence check could not see, and the one that cost a browser-journey suite: an
   * engine that claims the configuration and then cannot encode with it. Only trying it tells the
   * difference, which is why the operator is no longer asked to find out by waiting for a render.
   */
  it('answers no when a claimed configuration cannot actually encode', async () => {
    stubWebCodecs(encoderClass('error'));
    await expect(videoEditExportSupported()).resolves.toBe(false);
  });

  it('answers no when a frame is accepted but no chunk ever comes back', async () => {
    stubWebCodecs(encoderClass('silence'));
    await expect(videoEditExportSupported()).resolves.toBe(false);
  });

  it('asks once and reuses the answer', async () => {
    const encoder = encoderClass('chunk');
    stubWebCodecs(encoder);

    await Promise.all([videoEditExportSupported(), videoEditExportSupported()]);
    await videoEditExportSupported();
    expect(encoder.closed).toBe(1);
  });
});
