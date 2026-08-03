import { stat } from 'node:fs/promises';
import {
  inspectedVideoSchema,
  VIDEO_RESULT_DURATION_TOLERANCE_MS,
  type InspectedVideo,
  type VideoTransformOperationId,
} from '@studio/contracts';
import { validateUploadedVideoFacts } from '@studio/domain';
import { ALL_FORMATS, FilePathSource, Input, MP4, QTFF, WEBM } from 'mediabunny';
import { AppError } from '../../http/app-error.js';
import type { VideoJobOutputSizing } from '../../providers/video-jobs/video-job-provider.js';

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

const appErrorForProviderOutputValidation = (
  issue: ReturnType<typeof validateUploadedVideoFacts>[number],
): AppError => {
  if (issue.code === 'payload-too-large') {
    return new AppError(
      502,
      'result_too_large',
      'The visual result exceeded the app-owned 300 MB safety limit.',
    );
  }
  if (issue.code === 'duration-exceeded') {
    return new AppError(
      502,
      'result_invalid',
      'The visual result exceeded the app-owned 300-second limit.',
    );
  }
  return new AppError(
    502,
    'result_invalid',
    'The visual result did not meet the app-owned media requirements.',
  );
};

export const expectedProviderOutputDimensions = (
  resolution: '720p' | '1080p',
  orientation: 'landscape' | 'portrait',
): Readonly<{ width: number; height: number }> => {
  const landscape =
    resolution === '1080p' ? { width: 1_920, height: 1_080 } : { width: 1_280, height: 720 };
  return orientation === 'landscape'
    ? landscape
    : { width: landscape.height, height: landscape.width };
};

export const assertProviderOutputDimensions = (
  actual: Pick<InspectedVideo, 'width' | 'height'>,
  resolution: '720p' | '1080p',
  outputSizing: VideoJobOutputSizing,
  expectedOrientation?: 'landscape' | 'portrait',
): void => {
  const orientations =
    expectedOrientation === undefined
      ? (['landscape', 'portrait'] as const)
      : ([expectedOrientation] as const);
  const expected = orientations.map((orientation) =>
    expectedProviderOutputDimensions(resolution, orientation),
  );
  const valid = expected.some(
    (dimensions) => actual.width === dimensions.width && actual.height === dimensions.height,
  );
  if (valid) return;

  const expectedLabel = expected
    .map((dimensions) => `${dimensions.width} × ${dimensions.height}`)
    .join(' or ');
  if (outputSizing === 'megapixel-budget') {
    console.warn(
      '[video-jobs] Visual result dimensions differ from the approximate resolution target; continuing with the inspected result.',
      {
        actualWidth: actual.width,
        actualHeight: actual.height,
        expectedDimensions: expectedLabel,
        resolution,
        expectedOrientation: expectedOrientation ?? 'unspecified',
      },
    );
    return;
  }
  throw new AppError(
    502,
    'result_invalid',
    `The visual result dimensions were ${actual.width} × ${actual.height}; expected ${expectedLabel}${
      expectedOrientation ? ' for the source orientation' : ''
    }.`,
  );
};

export const inspectVideoFile = async (
  filePath: string,
  operation: VideoTransformOperationId,
  options: {
    readonly expectedDurationMs?: number;
    readonly expectedOrientation?: 'landscape' | 'portrait';
    readonly requireProviderOutputSize?: boolean;
    readonly expectedResolution?: '720p' | '1080p';
    readonly outputSizing?: VideoJobOutputSizing;
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
    if (options.requireProviderOutputSize) {
      assertProviderOutputDimensions(
        inspected,
        options.expectedResolution ?? '720p',
        options.outputSizing ?? 'exact-canonical',
        options.expectedOrientation,
      );
    }
    const issues = validateUploadedVideoFacts(
      inspected,
      options.requireProviderOutputSize ? [] : [operation],
    );
    const firstIssue = issues.find(
      (issue) =>
        !options.requireProviderOutputSize ||
        options.outputSizing !== 'megapixel-budget' ||
        issue.code !== 'unsupported-aspect-ratio',
    );
    if (firstIssue) {
      throw options.requireProviderOutputSize
        ? appErrorForProviderOutputValidation(firstIssue)
        : appErrorForValidation(firstIssue);
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
