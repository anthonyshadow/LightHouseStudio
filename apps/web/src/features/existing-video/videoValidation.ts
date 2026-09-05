import { validateUploadedVideoFacts } from '@studio/domain';
import { transcodeRecordingToMp4 } from '../../adapters/media-processing/transcodeRecording';
import { videoDecoderSupportsConfig } from '../../adapters/media-processing/videoDecodeSupport';
import type { AudioCodec } from 'mediabunny';
import type { UploadedTakeMetadata } from '../recording/types';

export type ValidatedExistingVideo = Readonly<{
  file: File;
  metadata: UploadedTakeMetadata;
  mimeType: 'video/mp4' | 'video/quicktime' | 'video/webm';
  audioSidecar: Readonly<{ blob: Blob; mimeType: string }> | null;
  audioUnavailableReason: string | null;
}>;

export type EditedVideoValidationExpectation = Readonly<{
  width: number;
  height: number;
  durationMs: number;
  requireAudio: boolean;
  filename: string;
}>;

export const firstExistingVideoValidationIssue = (
  facts: Parameters<typeof validateUploadedVideoFacts>[0],
  includesVton: boolean,
  validationContext: 'source' | 'server-approved-result',
): ReturnType<typeof validateUploadedVideoFacts>[number] | undefined =>
  validateUploadedVideoFacts(facts, includesVton ? ['virtual-try-on'] : []).find(
    (issue) =>
      validationContext !== 'server-approved-result' || issue.code !== 'unsupported-aspect-ratio',
  );

/**
 * A source this product cannot publish as it stands, but this browser can convert.
 *
 * Carried as an error rather than a return value because it is raised from the middle of a long
 * inspection that otherwise only ever throws or succeeds; the caller catches it, converts, and
 * inspects the result exactly as it would inspect any other file.
 */
class ConvertibleSourceError extends Error {
  constructor(readonly hasAudio: boolean) {
    super('This video needs converting before it can be used.');
    this.name = 'ConvertibleSourceError';
  }
}

/** The same name, said as the MP4 the conversion produces. */
const convertedFilename = (filename: string): string => {
  const separator = filename.lastIndexOf('.');
  return `${separator > 0 ? filename.slice(0, separator) : filename}.mp4`;
};

const waitForPlayableVideo = async (blob: Blob, signal: AbortSignal): Promise<void> => {
  const objectUrl = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.muted = true;
  video.preload = 'metadata';
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (callback: () => void) => {
        video.onloadedmetadata = null;
        video.onerror = null;
        signal.removeEventListener('abort', handleAbort);
        callback();
      };
      const handleAbort = () =>
        finish(() => reject(new DOMException('Video inspection was canceled.', 'AbortError')));
      video.onloadedmetadata = () =>
        finish(() => {
          if (
            !Number.isFinite(video.duration) ||
            video.duration <= 0 ||
            video.videoWidth <= 0 ||
            video.videoHeight <= 0
          ) {
            reject(new Error('The selected file does not expose a playable video track.'));
            return;
          }
          resolve();
        });
      video.onerror = () =>
        finish(() => reject(new Error('The browser could not decode the selected video.')));
      signal.addEventListener('abort', handleAbort, { once: true });
      video.src = objectUrl;
      video.load();
    });
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(objectUrl);
  }
};

export const extractExistingVideoAudioSidecar = async (
  inputBlob: Blob,
  container: UploadedTakeMetadata['container'],
  signal: AbortSignal,
): Promise<Readonly<{ blob: Blob; mimeType: string }> | null> => {
  const {
    ALL_FORMATS,
    BlobSource,
    BufferTarget,
    EncodedAudioPacketSource,
    EncodedPacketSink,
    Input,
    Mp4OutputFormat,
    Output,
    WebMOutputFormat,
  } = await import('mediabunny');
  signal.throwIfAborted();
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(inputBlob) });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const codec = (await track.getCodec()) as AudioCodec;
    const useWebM = container === 'webm' && (codec === 'opus' || codec === 'vorbis');
    const target = new BufferTarget();
    const output = new Output({
      format: useWebM ? new WebMOutputFormat() : new Mp4OutputFormat(),
      target,
    });
    const source = new EncodedAudioPacketSource(codec);
    output.addAudioTrack(source);
    await output.start();
    const sink = new EncodedPacketSink(track);
    const decoderConfig = await track.getDecoderConfig();
    let first = true;
    for await (const packet of sink.packets()) {
      signal.throwIfAborted();
      // MP4 AAC commonly carries one encoder-priming packet before timestamp zero.
      // That packet is intentionally not presented, and MP4/WebM muxers reject its
      // negative timestamp when the audio track is copied into a standalone sidecar.
      if (packet.timestamp < 0) continue;
      await source.add(packet, first && decoderConfig ? { decoderConfig } : undefined);
      first = false;
    }
    source.close();
    const mimeType = await output.getMimeType();
    await output.finalize();
    if (!target.buffer?.byteLength) return null;
    return { blob: new Blob([target.buffer], { type: mimeType }), mimeType };
  } finally {
    input.dispose();
  }
};

const inspectExistingVideo = async (
  file: File,
  includesVton: boolean,
  signal: AbortSignal,
  validationContext: 'source' | 'server-approved-result',
  convertible: boolean,
): Promise<ValidatedExistingVideo> => {
  if (!(file instanceof File) || file.size <= 0) {
    throw new Error('Choose a non-empty video file.');
  }
  const { ALL_FORMATS, BlobSource, Input, MP4, QTFF, WEBM } = await import('mediabunny');
  signal.throwIfAborted();
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    if (!(await input.canRead())) throw new Error('The selected video could not be read.');
    const format = await input.getFormat();
    const formatDetails =
      format === MP4
        ? ({ container: 'mp4', mimeType: 'video/mp4' } as const)
        : format === QTFF
          ? ({ container: 'quicktime', mimeType: 'video/quicktime' } as const)
          : format === WEBM
            ? ({ container: 'webm', mimeType: 'video/webm' } as const)
            : null;
    if (!formatDetails) throw new Error('Use an MP4, H.264 MOV, or VP8 WebM video.');
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) throw new Error('The selected file does not contain a video track.');
    const videoCodec = await videoTrack.getCodec();
    if (!videoCodec) throw new Error('The selected video codec could not be identified.');
    const audioTrack = await input.getPrimaryAudioTrack();
    const durationSeconds =
      (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
    const facts = {
      container: formatDetails.container,
      videoCodec,
      durationMs: durationSeconds * 1_000,
      width: Math.round(await videoTrack.getDisplayWidth()),
      height: Math.round(await videoTrack.getDisplayHeight()),
      sizeBytes: file.size,
      hasAudio: audioTrack !== null,
    };
    const firstIssue = firstExistingVideoValidationIssue(facts, includesVton, validationContext);
    if (firstIssue) {
      /*
       * A codec this product cannot publish is the one refusal worth a second question: iPhone
       * footage is HEVC by default, and where this browser can decode it the file can be converted
       * here instead of somewhere else. Asked with the file's own decoder configuration, so the
       * answer is about these bytes on this device.
       */
      if (firstIssue.code !== 'unsupported-codec' || !convertible)
        throw new Error(firstIssue.message);
      // A file whose configuration cannot even be read is one this browser certainly cannot
      // convert, and saying that is better than surfacing a decoder's own words.
      const decoderConfig = await videoTrack.getDecoderConfig().catch(() => null);
      signal.throwIfAborted();
      if (decoderConfig === null || !(await videoDecoderSupportsConfig(decoderConfig))) {
        throw new Error(
          `${firstIssue.message} This browser cannot convert it either — convert it to H.264 MP4 and choose it again.`,
        );
      }
      throw new ConvertibleSourceError(audioTrack !== null);
    }
    signal.throwIfAborted();
    await waitForPlayableVideo(file, signal);

    let audioSidecar: ValidatedExistingVideo['audioSidecar'] = null;
    let audioUnavailableReason: string | null = null;
    if (audioTrack) {
      try {
        audioSidecar = await extractExistingVideoAudioSidecar(
          file,
          formatDetails.container,
          signal,
        );
        if (!audioSidecar) {
          audioUnavailableReason =
            'The source audio could not be preserved separately, so Voice is unavailable.';
        }
      } catch {
        signal.throwIfAborted();
        audioUnavailableReason =
          'The source audio could not be preserved separately, so Voice is unavailable.';
      }
    }
    const metadata: UploadedTakeMetadata = {
      kind: 'uploaded',
      mode: 'local',
      selectedAt: new Date().toISOString(),
      displayName: file.name,
      container: formatDetails.container,
      videoCodec: videoCodec as 'avc' | 'vp8',
      audioCodec: audioTrack ? await audioTrack.getCodec() : null,
      durationMs: facts.durationMs,
      width: facts.width,
      height: facts.height,
      sizeBytes: facts.sizeBytes,
      hasAudio: facts.hasAudio,
    };
    return {
      file,
      metadata,
      mimeType: formatDetails.mimeType,
      audioSidecar,
      audioUnavailableReason,
    };
  } finally {
    input.dispose();
  }
};

/**
 * Turns a picked file into a source this product can work with, converting it once where that is
 * what stands in the way.
 *
 * A conversion is a real cost — it decodes and re-encodes the whole video — so it happens only for
 * a source whose codec is the single thing wrong with it, only when the browser has said it can
 * decode that codec, and never for a file the server has already approved. `onConvert` is how the
 * surface says what is happening, because the wait is long enough to need explaining.
 */
export const validateExistingVideo = async (
  file: File,
  includesVton: boolean,
  signal: AbortSignal,
  validationContext: 'source' | 'server-approved-result' = 'source',
  options: { readonly onConvert?: () => void } = {},
): Promise<ValidatedExistingVideo> => {
  try {
    return await inspectExistingVideo(
      file,
      includesVton,
      signal,
      validationContext,
      validationContext === 'source',
    );
  } catch (error) {
    if (!(error instanceof ConvertibleSourceError)) throw error;
    options.onConvert?.();
    const converted = await transcodeRecordingToMp4(file, {
      requireAudio: error.hasAudio,
      signal,
    });
    signal.throwIfAborted();
    // Inspected like any other file, and no longer convertible: one conversion is the offer.
    return inspectExistingVideo(
      new File([converted.blob], convertedFilename(file.name), { type: converted.mimeType }),
      includesVton,
      signal,
      validationContext,
      false,
    );
  }
};

export const validateEditedVideoOutput = async (
  blob: Blob,
  expectation: EditedVideoValidationExpectation,
  signal: AbortSignal,
): Promise<ValidatedExistingVideo> => {
  if (!(blob instanceof Blob) || blob.size <= 0) {
    throw new Error('The local editor produced an empty video.');
  }
  const file = new File([blob], expectation.filename, { type: 'video/mp4' });
  const validated = await validateExistingVideo(file, false, signal, 'server-approved-result');
  signal.throwIfAborted();
  assertEditedVideoOutput(validated, expectation);
  return validated;
};

export const assertEditedVideoOutput = (
  validated: ValidatedExistingVideo,
  expectation: EditedVideoValidationExpectation,
): void => {
  if (validated.mimeType !== 'video/mp4' || validated.metadata.videoCodec !== 'avc') {
    throw new Error('The edited video was not encoded as H.264 MP4.');
  }
  if (
    validated.metadata.width !== expectation.width ||
    validated.metadata.height !== expectation.height
  ) {
    throw new Error('The edited video dimensions did not match the requested crop.');
  }
  if (Math.abs(validated.metadata.durationMs - expectation.durationMs) > 500) {
    throw new Error('The edited video duration did not match the requested trim.');
  }
  if (
    expectation.requireAudio &&
    (!validated.metadata.hasAudio ||
      validated.metadata.audioCodec !== 'aac' ||
      !validated.audioSidecar)
  ) {
    throw new Error('The edited video could not preserve its required audio track.');
  }
};
