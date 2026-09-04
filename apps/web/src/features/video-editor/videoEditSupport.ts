/**
 * Whether this browser can run the editor's WebGL preview, probed with a throwaway context that is
 * released at once.
 *
 * On its own so the surfaces that only ask the question — the Studio route deciding whether to
 * offer the editor, a save dialog deciding whether to offer a placement — do not load the shader
 * source and renderer that only the open editor runs.
 */
export const videoEditPreviewSupported = (): boolean => {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  if (!gl) return false;
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return true;
};

/** The classes an export needs. Cheap and synchronous, and a `false` here is final. */
export const videoEditRenderingApisPresent = (): boolean =>
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined' &&
  typeof VideoEncoder !== 'undefined' &&
  typeof VideoDecoder !== 'undefined' &&
  typeof VideoFrame !== 'undefined';

/*
 * Exactly what MediaBunny asks for. Its `canEncodeVideo('avc')` — the gate the render worker
 * applies before it encodes anything — builds a High Profile string at its 1280×720 default with a
 * 1 Mbps estimate, which is `avc1.6400` plus the level that fits 3600 macroblocks. Asking a
 * different question here would produce a control that disagrees with the render behind it.
 */
const H264_PROBE_CONFIG: VideoEncoderConfig = {
  codec: 'avc1.64001f',
  width: 1280,
  height: 720,
  bitrate: 1_000_000,
};

/**
 * How long the trial encode may take before its answer stops being worth waiting for. Reaching it
 * keeps the control offered: `isConfigSupported` has already said yes by then, and disabling a
 * working editor because a probe was slow is the worse of the two mistakes.
 */
const TRIAL_ENCODE_TIMEOUT_MS = 5_000;

/**
 * Encodes one frame and reports whether a chunk came back.
 *
 * `isConfigSupported` is a claim, not a demonstration, and engines disagree about how strong a
 * claim it is — MediaBunny encodes a real frame on Firefox for this exact reason, and the Linux
 * WebKit build the browser-journey runners use answers every presence check while never completing
 * an encode. So ask the encoder to do the thing.
 */
const trialEncode = (): Promise<boolean> =>
  new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (value: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        if (encoder.state !== 'closed') encoder.close();
      } catch {
        // A browser that fails to close a failed encoder has already answered the question.
      }
      frame?.close();
      resolve(value);
    };
    const timer = setTimeout(() => settle(true), TRIAL_ENCODE_TIMEOUT_MS);
    let frame: VideoFrame | null = null;
    const encoder = new VideoEncoder({
      output: () => settle(true),
      error: () => settle(false),
    });
    try {
      encoder.configure(H264_PROBE_CONFIG);
      const canvas = new OffscreenCanvas(H264_PROBE_CONFIG.width, H264_PROBE_CONFIG.height);
      // Painting once is what gives the canvas image data. A frame built from one that has never
      // had a context is rejected outright on some engines, which would answer the wrong question.
      canvas.getContext('2d')?.fillRect(0, 0, 2, 2);
      frame = new VideoFrame(canvas, { timestamp: 0 });
      encoder.encode(frame, { keyFrame: true });
      // A frame that produces no chunk at all is as unusable as one that errors.
      void encoder.flush().then(
        () => settle(false),
        () => settle(false),
      );
    } catch {
      settle(false);
    }
  });

let exportSupport: Promise<boolean> | null = null;

/**
 * Whether this browser can actually produce the editor's output, asked once per page.
 *
 * The classes existing is not the same as the codec working. Checking only for the classes offered
 * **Save edited video** on engines that cannot encode H.264, so the operator learned the answer by
 * waiting for a render that then failed, instead of reading the notice that says the editor is
 * unavailable and that their video is untouched.
 */
export const videoEditExportSupported = (): Promise<boolean> => {
  exportSupport ??= (async () => {
    if (!videoEditRenderingApisPresent()) return false;
    try {
      const support = await VideoEncoder.isConfigSupported(H264_PROBE_CONFIG);
      if (support.supported !== true) return false;
    } catch {
      return false;
    }
    return await trialEncode();
  })();
  return exportSupport;
};

/** Test seam: the probe is memoized for the life of the page, which outlives one test. */
export const resetVideoEditExportSupportForTests = (): void => {
  exportSupport = null;
};
