import { stat } from 'node:fs/promises';
import { inspectedVideoSchema, type InspectedVideo } from '@studio/contracts';
import { validateUploadedVideoFacts } from '@studio/domain';
import { ALL_FORMATS, FilePathSource, Input, MP4, QTFF, WEBM } from 'mediabunny';
import { AppError } from '../../http/app-error.js';

export const inspectSavedVideoFile = async (filePath: string): Promise<InspectedVideo> => {
  const file = await stat(filePath).catch(() => null);
  if (!file?.isFile() || file.size <= 0) {
    throw new AppError(400, 'invalid_video', 'The saved video is empty or invalid.');
  }
  const input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(filePath) });
  try {
    if (!(await input.canRead())) throw new Error('Unreadable video');
    const format = await input.getFormat();
    const container: 'mp4' | 'quicktime' | 'webm' | null =
      format === MP4 ? 'mp4' : format === QTFF ? 'quicktime' : format === WEBM ? 'webm' : null;
    if (container === null) {
      throw new AppError(400, 'unsupported_container', 'Use an MP4, H.264 MOV, or VP8 WebM video.');
    }
    const videoTrack = await input.getPrimaryVideoTrack();
    if (videoTrack === null) throw new Error('Missing video track');
    const audioTrack = await input.getPrimaryAudioTrack();
    const durationSeconds =
      (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
    const raw = {
      mimeType:
        container === 'mp4'
          ? ('video/mp4' as const)
          : container === 'quicktime'
            ? ('video/quicktime' as const)
            : ('video/webm' as const),
      container,
      videoCodec: (await videoTrack.getCodec()) ?? '',
      audioCodec: audioTrack === null ? null : await audioTrack.getCodec(),
      durationMs: Math.max(1, Math.round(durationSeconds * 1_000)),
      width: Math.round(await videoTrack.getDisplayWidth()),
      height: Math.round(await videoTrack.getDisplayHeight()),
      sizeBytes: file.size,
      hasAudio: audioTrack !== null,
    };
    const issue = validateUploadedVideoFacts(raw, [])[0];
    if (issue !== undefined) {
      throw new AppError(
        issue.code === 'payload-too-large' ? 413 : 400,
        issue.code.replaceAll('-', '_') as 'invalid_video',
        issue.message,
      );
    }
    return inspectedVideoSchema.parse(raw);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'invalid_video', 'The saved video could not be inspected safely.', {
      cause: error,
    });
  } finally {
    input.dispose();
  }
};
