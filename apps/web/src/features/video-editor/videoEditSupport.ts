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

/*
 * The classes an export needs. Cheap, synchronous, and a `false` here is final — but private,
 * because it is the pre-fix answer wearing a confident name: every one of these can be defined on
 * an engine that cannot encode a frame. Nothing outside this module should be able to reach for it
 * and think it has asked the question.
 */
const videoEditRenderingApisPresent = (): boolean =>
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
        encoder.close();
      } catch {
        // Closing an already-closed encoder is the specified throw, and a browser that fails to
        // close a failed one has answered the question anyway.
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
      // A frame that produces no chunk at all is as unusable as one that errors, and a flush that
      // rejects says the same thing, so both land on the same answer.
      const noChunk = () => settle(false);
      void encoder.flush().then(noChunk, noChunk);
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

/**
 * Whether this browser can run the local editor at all: draw the preview and produce the file.
 *
 * The one owner of that composition. Both halves are needed by whoever offers an edit and by
 * whoever offers a placement, and stating it once is what stops a third requirement being added to
 * one caller and not the others.
 */
export const videoEditSupported = async (): Promise<boolean> =>
  videoEditPreviewSupported() && (await videoEditExportSupported());
