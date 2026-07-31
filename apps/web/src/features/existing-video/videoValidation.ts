import { validateUploadedVideoFacts } from '@studio/domain';
import type { AudioCodec } from 'mediabunny';
import type { UploadedTakeMetadata } from '../recording/types';

export type ValidatedExistingVideo = Readonly<{
  file: File;
  metadata: UploadedTakeMetadata;
  mimeType: 'video/mp4' | 'video/quicktime' | 'video/webm';
  audioSidecar: Readonly<{ blob: Blob; mimeType: string }> | null;
  audioUnavailableReason: string | null;
}>;

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

const extractAudioSidecar = async (
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

export const validateExistingVideo = async (
  file: File,
  includesVton: boolean,
  signal: AbortSignal,
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
    const issues = validateUploadedVideoFacts(
      facts,
      includesVton ? [{ modelId: 'lucy-vton-latest' }] : [],
    );
    if (issues[0]) throw new Error(issues[0].message);
    signal.throwIfAborted();
    await waitForPlayableVideo(file, signal);

    let audioSidecar: ValidatedExistingVideo['audioSidecar'] = null;
    let audioUnavailableReason: string | null = null;
    if (audioTrack) {
      try {
        audioSidecar = await extractAudioSidecar(file, formatDetails.container, signal);
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
