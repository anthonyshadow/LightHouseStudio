import { ensureAacEncodingSupport } from './aacEncoding';

type RecordingTranscodeResult = Readonly<{
  blob: Blob;
  mimeType: 'video/mp4';
}>;

type RecordingTranscodeOptions = Readonly<{
  requireAudio: boolean;
  signal: AbortSignal;
}>;

/**
 * Converts a settled MediaRecorder artifact into the only downloadable
 * recording format: MP4 with an AVC/H.264 video track and AAC audio when the
 * source contains audio. The raw recorder Blob remains an input only and never
 * receives an object URL.
 */
export const transcodeRecordingToMp4 = async (
  recordedBlob: Blob,
  { requireAudio, signal }: RecordingTranscodeOptions,
): Promise<RecordingTranscodeResult> => {
  signal.throwIfAborted();
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    Conversion,
    Input,
    Mp4OutputFormat,
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
    if (!(await canEncodeVideo('avc'))) {
      throw new Error('This browser cannot encode H.264 video.');
    }
    if (audioTrack) {
      await ensureAacEncodingSupport(() => canEncodeAudio('aac'));
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
        forceTranscode: true,
        hardwareAcceleration: 'prefer-hardware',
      },
      audio: {
        codec: 'aac',
        forceTranscode: true,
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

    return {
      blob: new Blob([target.buffer], { type: 'video/mp4' }),
      mimeType: 'video/mp4',
    };
  } catch (error) {
    if (conversion && conversion.state !== 'done' && conversion.state !== 'canceled') {
      await conversion.cancel().catch(() => undefined);
    }
    throw error;
  } finally {
    input.dispose();
  }
};
