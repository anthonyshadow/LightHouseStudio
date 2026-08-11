import {
  FULL_VIDEO_CROP,
  getVideoEditOutputGeometry,
  rotatedVideoEditDimensions,
  type VideoEditSpec,
} from '@studio/domain';
import { ensureAacEncodingSupport } from '../../adapters/media-processing/aacEncoding';
import type { VideoEditWorkerRequest, VideoEditWorkerResponse } from './types';
import {
  VIDEO_EDIT_OUTPUT_BLOCK_BYTES,
  VideoEditChunkAccumulator,
} from './videoEditChunkAccumulator';
import { createVideoEditFrameRenderer } from './videoEditShader';

let activeOperationId: number | null = null;
let activeConversion: { cancel: () => Promise<void> } | null = null;
let canceledOperationId: number | null = null;

type VideoEditWorkerScope = Readonly<{
  postMessage: (message: VideoEditWorkerResponse) => void;
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<VideoEditWorkerRequest>) => void,
  ) => void;
}>;

const workerScope = globalThis as unknown as VideoEditWorkerScope;
const respond = (message: VideoEditWorkerResponse): void => workerScope.postMessage(message);

const safeMessage = (error: unknown): string => {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'The local video render was canceled.';
  }
  if (error instanceof Error && /300 MB/u.test(error.message)) return error.message;
  return 'The browser could not render this edit. The current video remains unchanged.';
};

const render = async (
  request: Extract<VideoEditWorkerRequest, { type: 'render' }>,
): Promise<void> => {
  activeOperationId = request.operationId;
  const writer = new VideoEditChunkAccumulator();
  let input: { dispose: () => void } | null = null;
  let renderer: ReturnType<typeof createVideoEditFrameRenderer> | null = null;
  const throwIfCanceled = (): void => {
    if (canceledOperationId === request.operationId) {
      throw new DOMException('The local video render was canceled.', 'AbortError');
    }
  };
  try {
    const {
      ALL_FORMATS,
      BlobSource,
      Conversion,
      Input,
      Mp4OutputFormat,
      Output,
      StreamTarget,
      canEncodeAudio,
      canEncodeVideo,
    } = await import('mediabunny');
    throwIfCanceled();
    const mediaInput = new Input({ formats: ALL_FORMATS, source: new BlobSource(request.source) });
    input = mediaInput;
    const [videoTrack, audioTrack] = await Promise.all([
      mediaInput.getPrimaryVideoTrack(),
      mediaInput.getPrimaryAudioTrack(),
    ]);
    throwIfCanceled();
    if (!videoTrack) throw new Error('Missing video track.');
    if (request.requireAudio && !audioTrack) throw new Error('Missing audio track.');
    if (!(await canEncodeVideo('avc'))) throw new Error('H.264 encoding is unavailable.');
    if (audioTrack) await ensureAacEncodingSupport(() => canEncodeAudio('aac'));

    const geometry = getVideoEditOutputGeometry(
      {
        width: request.sourceWidth,
        height: request.sourceHeight,
        durationMs: request.spec.trim.endMs,
      },
      request.spec,
    );
    const rotated = rotatedVideoEditDimensions(
      request.sourceWidth,
      request.sourceHeight,
      request.spec.rotation,
    );
    const crop = request.spec.crop.rectangle;
    const cropPixels = {
      left: Math.round(crop.x * rotated.width),
      top: Math.round(crop.y * rotated.height),
      width: Math.max(2, Math.round(crop.width * rotated.width)),
      height: Math.max(2, Math.round(crop.height * rotated.height)),
    };
    const frameCanvas = new OffscreenCanvas(geometry.width, geometry.height);
    renderer = createVideoEditFrameRenderer(frameCanvas);
    const processedSpec: VideoEditSpec = {
      ...request.spec,
      crop: { preset: 'original', rectangle: FULL_VIDEO_CROP },
      rotation: 0,
    };
    const writable = new WritableStream({
      write(chunk: { data: Uint8Array; position: number }) {
        writer.write(chunk.data, chunk.position);
      },
    });
    const target = new StreamTarget(writable, {
      chunked: true,
      chunkSize: VIDEO_EDIT_OUTPUT_BLOCK_BYTES,
    });
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: false }),
      target,
    });
    const conversion = await Conversion.init({
      input: mediaInput,
      output,
      tracks: 'primary',
      trim: {
        start: request.spec.trim.startMs / 1_000,
        end: request.spec.trim.endMs / 1_000,
      },
      video: {
        codec: 'avc',
        forceTranscode: true,
        hardwareAcceleration: 'prefer-software',
        rotate: request.spec.rotation,
        allowRotationMetadata: false,
        crop: cropPixels,
        width: geometry.width,
        height: geometry.height,
        fit: 'fill',
        process: (sample) => {
          const frame = sample.toVideoFrame();
          try {
            renderer?.render(frame, processedSpec);
          } finally {
            frame.close();
          }
          return frameCanvas;
        },
        processedWidth: geometry.width,
        processedHeight: geometry.height,
      },
      ...(audioTrack ? { audio: { codec: 'aac' as const, forceTranscode: true } } : undefined),
      tags: {},
      showWarnings: false,
    });
    activeConversion = conversion;
    if (canceledOperationId === request.operationId) {
      await conversion.cancel().catch(() => undefined);
      throwIfCanceled();
    }
    if (
      !conversion.isValid ||
      !conversion.utilizedTracks.includes(videoTrack) ||
      (audioTrack !== null && !conversion.utilizedTracks.includes(audioTrack))
    ) {
      throw new Error('The edit would drop required media tracks.');
    }
    conversion.onProgress = (progress) => {
      if (
        activeOperationId === request.operationId &&
        canceledOperationId !== request.operationId
      ) {
        respond({ type: 'progress', operationId: request.operationId, progress });
      }
    };
    await conversion.execute();
    throwIfCanceled();
    if (activeOperationId !== request.operationId) return;
    const mimeType = await output.getMimeType();
    const blob = writer.toBlob(mimeType);
    if (blob.size <= 0) throw new Error('The edited output was empty.');
    respond({ type: 'complete', operationId: request.operationId, blob, mimeType: 'video/mp4' });
  } catch (error) {
    if (activeOperationId === request.operationId && canceledOperationId !== request.operationId) {
      respond({ type: 'error', operationId: request.operationId, message: safeMessage(error) });
    }
  } finally {
    renderer?.dispose();
    input?.dispose();
    writer.clear();
    if (activeOperationId === request.operationId) {
      activeOperationId = null;
      activeConversion = null;
      if (canceledOperationId === request.operationId) canceledOperationId = null;
    }
  }
};

workerScope.addEventListener('message', (event) => {
  // Dedicated-worker messages arrive through the worker's private MessagePort, whose
  // MessageEvent origin is empty. Reject any event that does not match that channel contract.
  if (event.origin !== '') return;
  const request = event.data;
  if (request.type === 'cancel') {
    if (activeOperationId !== request.operationId) return;
    if (canceledOperationId === request.operationId) return;
    canceledOperationId = request.operationId;
    respond({ type: 'canceled', operationId: request.operationId });
    void activeConversion?.cancel().catch(() => undefined);
    return;
  }
  if (activeOperationId !== null) {
    respond({
      type: 'error',
      operationId: request.operationId,
      message: 'Another local video render is already active.',
    });
    return;
  }
  void render(request);
});
