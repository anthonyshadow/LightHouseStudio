import { ensureAacEncodingSupport } from './aacEncoding';

type RecordingTranscodeResult = Readonly<{
  blob: Blob;
  mimeType: 'video/mp4';
}>;

type RecordingTranscodeOptions = Readonly<{
  requireAudio: boolean;
  signal: AbortSignal;
  targetDimensions?: Readonly<{ width: number; height: number }>;
}>;

/**
 * Converts a settled MediaRecorder artifact into the only downloadable
 * recording format: MP4 with an AVC/H.264 video track and AAC audio when the
 * source contains audio. The raw recorder Blob remains an input only and never
 * receives an object URL.
 */
export const transcodeRecordingToMp4 = async (
  recordedBlob: Blob,
  { requireAudio, signal, targetDimensions }: RecordingTranscodeOptions,
): Promise<RecordingTranscodeResult> => {
  signal.throwIfAborted();
  if (
    targetDimensions &&
    (!Number.isInteger(targetDimensions.width) ||
      !Number.isInteger(targetDimensions.height) ||
      targetDimensions.width <= 0 ||
      targetDimensions.height <= 0 ||
      targetDimensions.width % 2 !== 0 ||
      targetDimensions.height % 2 !== 0)
  ) {
    throw new Error('Target video dimensions must be positive even integers.');
  }
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
    MP4,
    Output,
    canEncodeAudio,
    canEncodeVideo,
  } = await import('mediabunny');
  signal.throwIfAborted();

  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(recordedBlob),
  });
  let conversion: Awaited<ReturnType<typeof Conversion.init>> | null = null;

  try {
    const [videoTrack, audioTrack] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
    signal.throwIfAborted();

    if (!videoTrack) throw new Error('The recording has no video track.');
    if (requireAudio && !audioTrack) {
      throw new Error('The recording is missing its captured audio track.');
    }
    const sourceVideoCodec = await videoTrack.getCodec();
    const sourceAudioCodec = audioTrack ? await audioTrack.getCodec() : null;
    const videoRequiresTranscode = sourceVideoCodec !== 'avc' || targetDimensions !== undefined;
    const audioRequiresTranscode = audioTrack !== null && sourceAudioCodec !== 'aac';
    if (videoRequiresTranscode && !(await canEncodeVideo('avc'))) {
      throw new Error('This browser cannot encode H.264 video.');
    }
    if (audioRequiresTranscode) {
      await ensureAacEncodingSupport(() => canEncodeAudio('aac'));
    }
    const sourceWidth = await videoTrack.getDisplayWidth();
    const sourceHeight = await videoTrack.getDisplayHeight();
    const sourceDuration =
      (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
    if (
      sourceWidth <= 0 ||
      sourceHeight <= 0 ||
      !Number.isFinite(sourceDuration) ||
      sourceDuration <= 0
    ) {
      throw new Error('The recording source failed duration or orientation validation.');
    }
    signal.throwIfAborted();

    const target = new BufferTarget();
    const output = new Output({
      format: new Mp4OutputFormat({ fastStart: false }),
      target,
    });
    conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      video: {
        codec: 'avc',
        forceTranscode: videoRequiresTranscode,
        // Let each browser select its available H.264 path. Headless Chromium often
        // exposes software only, while WebKit and physical browsers may expose a
        // different acceleration class.
        hardwareAcceleration: 'no-preference',
        ...(targetDimensions
          ? {
              width: targetDimensions.width,
              height: targetDimensions.height,
              fit: 'contain' as const,
            }
          : {}),
      },
      audio: {
        codec: 'aac',
        forceTranscode: audioRequiresTranscode,
      },
      tags: {},
      showWarnings: false,
    });

    if (
      !conversion.isValid ||
      !conversion.utilizedTracks.includes(videoTrack) ||
      (audioTrack !== null && !conversion.utilizedTracks.includes(audioTrack))
    ) {
      throw new Error('The recording could not be converted without dropping video or audio.');
    }

    const cancel = () => {
      if (conversion?.state === 'executing' || conversion?.state === 'idle') {
        void conversion.cancel().catch(() => undefined);
      }
    };
    signal.addEventListener('abort', cancel, { once: true });
    try {
      signal.throwIfAborted();
      await conversion.execute();
      signal.throwIfAborted();
    } finally {
      signal.removeEventListener('abort', cancel);
    }

    const outputMimeType = await output.getMimeType();
    if (!outputMimeType.toLowerCase().startsWith('video/mp4')) {
      throw new Error('The recording converter produced an unexpected container.');
    }
    if (!target.buffer?.byteLength) {
      throw new Error('The converted recording was empty.');
    }

    const blob = new Blob([target.buffer], { type: 'video/mp4' });
    const outputInput = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
    try {
      if (!(await outputInput.canRead()) || (await outputInput.getFormat()) !== MP4) {
        throw new Error('The converted recording is not a readable MP4.');
      }
      const [outputVideo, outputAudio] = await Promise.all([
        outputInput.getPrimaryVideoTrack(),
        outputInput.getPrimaryAudioTrack(),
      ]);
      if (!outputVideo || (await outputVideo.getCodec()) !== 'avc') {
        throw new Error('The converted recording is missing its H.264 video track.');
      }
      if (requireAudio && (!outputAudio || (await outputAudio.getCodec()) !== 'aac')) {
        throw new Error('The converted recording is missing its AAC audio track.');
      }
      if (outputAudio && (await outputAudio.getCodec()) !== 'aac') {
        throw new Error('The converted recording contains an unexpected audio codec.');
      }
      const outputWidth = await outputVideo.getDisplayWidth();
      const outputHeight = await outputVideo.getDisplayHeight();
      const outputDuration =
        (await outputInput.getDurationFromMetadata()) ?? (await outputInput.computeDuration());
      if (
        outputWidth <= 0 ||
        outputHeight <= 0 ||
        !Number.isFinite(outputDuration) ||
        outputDuration <= 0 ||
        Math.abs(outputDuration - sourceDuration) > 0.5 ||
        (targetDimensions !== undefined &&
          (outputWidth !== targetDimensions.width || outputHeight !== targetDimensions.height)) ||
        outputWidth > outputHeight !== sourceWidth > sourceHeight
      ) {
        throw new Error('The converted recording failed duration or orientation validation.');
      }
    } finally {
      outputInput.dispose();
    }

    return { blob, mimeType: 'video/mp4' };
  } catch (error) {
    if (conversion && conversion.state !== 'done' && conversion.state !== 'canceled') {
      await conversion.cancel().catch(() => undefined);
    }
    throw error;
  } finally {
    input.dispose();
  }
};
