import { stat } from 'node:fs/promises';
import {
  inspectedVideoSchema,
  VIDEO_RESULT_DURATION_TOLERANCE_MS,
  type InspectedVideo,
  type VideoTransformModelId,
} from '@studio/contracts';
import { validateUploadedVideoFacts } from '@studio/domain';
import { ALL_FORMATS, FilePathSource, Input, MP4, QTFF, WEBM } from 'mediabunny';
import { AppError } from '../../http/app-error.js';

const containerDetails = (
  format: Awaited<ReturnType<Input['getFormat']>>,
): Pick<InspectedVideo, 'container' | 'mimeType'> | null => {
  if (format === MP4) return { container: 'mp4', mimeType: 'video/mp4' };
  if (format === QTFF) return { container: 'quicktime', mimeType: 'video/quicktime' };
  if (format === WEBM) return { container: 'webm', mimeType: 'video/webm' };
  return null;
};

const appErrorForValidation = (
  issue: ReturnType<typeof validateUploadedVideoFacts>[number],
): AppError => {
  const statusCode = issue.code === 'payload-too-large' ? 413 : 400;
  const code = issue.code.replaceAll('-', '_') as
    | 'invalid_video'
    | 'unsupported_container'
    | 'unsupported_codec'
    | 'unsupported_aspect_ratio'
    | 'duration_exceeded'
    | 'payload_too_large';
  return new AppError(statusCode, code, issue.message);
};

export const inspectVideoFile = async (
  filePath: string,
  modelId: VideoTransformModelId,
  options: {
    readonly expectedDurationMs?: number;
    readonly expectedOrientation?: 'landscape' | 'portrait';
    readonly requireProviderOutputSize?: boolean;
  } = {},
): Promise<InspectedVideo> => {
  const file = await stat(filePath).catch(() => null);
  if (!file?.isFile() || file.size <= 0) {
    throw new AppError(400, 'invalid_video', 'The uploaded video is empty or invalid.');
  }

  const input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(filePath) });
  try {
    if (!(await input.canRead())) {
      throw new AppError(400, 'invalid_video', 'The uploaded video could not be read.');
    }
    const format = containerDetails(await input.getFormat());
    if (!format) {
      throw new AppError(400, 'unsupported_container', 'Use an MP4, H.264 MOV, or VP8 WebM video.');
    }
    const videoTrack = await input.getPrimaryVideoTrack();
    if (!videoTrack) {
      throw new AppError(400, 'invalid_video', 'The selected file does not contain a video track.');
    }
    const videoCodec = await videoTrack.getCodec();
    const audioTrack = await input.getPrimaryAudioTrack();
    const durationSeconds =
      (await input.getDurationFromMetadata()) ?? (await input.computeDuration());
    const inspected = inspectedVideoSchema.parse({
      ...format,
      videoCodec,
      audioCodec: audioTrack ? await audioTrack.getCodec() : null,
      durationMs: durationSeconds * 1_000,
      width: Math.round(await videoTrack.getDisplayWidth()),
      height: Math.round(await videoTrack.getDisplayHeight()),
      sizeBytes: file.size,
      hasAudio: audioTrack !== null,
    });
    const issues = validateUploadedVideoFacts(inspected, [
      {
        modelId,
      },
    ]);
    if (issues[0]) throw appErrorForValidation(issues[0]);

    if (options.requireProviderOutputSize) {
      const validResolution =
        (inspected.width === 1_280 && inspected.height === 720) ||
        (inspected.width === 720 && inspected.height === 1_280);
      if (!validResolution) {
        throw new AppError(
          502,
          'result_invalid',
          'The visual provider returned an unexpected output resolution.',
        );
      }
      if (
        options.expectedOrientation !== undefined &&
        (inspected.width > inspected.height ? 'landscape' : 'portrait') !==
          options.expectedOrientation
      ) {
        throw new AppError(
          502,
          'result_invalid',
          'The visual provider returned the wrong 720p orientation.',
        );
      }
    }
    if (
      options.expectedDurationMs !== undefined &&
      Math.abs(inspected.durationMs - options.expectedDurationMs) >
        VIDEO_RESULT_DURATION_TOLERANCE_MS
    ) {
      throw new AppError(
        502,
        'result_invalid',
        'The visual result duration is not safe to synchronize with the source audio.',
      );
    }
    return inspected;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, 'invalid_video', 'The uploaded video could not be inspected.', {
      cause: error,
    });
  } finally {
    input.dispose();
  }
};
