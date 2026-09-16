import type { Composition } from '@studio/domain';
import type { ProjectClipMedia } from '../projects/projectClipMedia';
import type { CompositionRenderMedia, CompositionRenderPlan } from './types';
import {
  VIDEO_EDIT_RENDER_UNSUPPORTED_MESSAGE,
  runVideoEditWorker,
  type VideoEditWorkerOutcome,
} from './videoEditWorkerClient';
import { videoEditExportSupported } from './videoEditSupport';

export type RenderCompositionInput = Readonly<{
  composition: Composition;
  /** Index-aligned with `composition.clips`; every clip's media, already resolved. */
  media: readonly CompositionRenderMedia[];
  signal: AbortSignal;
  onProgress: (progress: number) => void;
  /** What the render decided before paying for anything, as soon as it has decided it. */
  onPlan?: ((plan: CompositionRenderPlan) => void) | undefined;
}>;

export type RenderCompositionResult = VideoEditWorkerOutcome &
  Readonly<{ plan: CompositionRenderPlan }>;

/**
 * A clip's media as the worker needs it: an absolute URL, because a worker resolves nothing
 * against the page, and the frame the plan is made from; sound is read from the media itself.
 */
export const compositionRenderMediaOf = (media: ProjectClipMedia): CompositionRenderMedia => ({
  url: new URL(media.contentUrl, window.location.origin).href,
  mimeType: media.mimeType,
  filename: media.filename,
  width: media.width,
  height: media.height,
});

/**
 * Renders an arrangement through the same worker the single-clip editor uses, and resolves with
 * the file and the plan it was made to. Nothing here is saved anywhere; the caller owns the Blob.
 */
export const renderComposition = async ({
  composition,
  media,
  signal,
  onProgress,
  onPlan,
}: RenderCompositionInput): Promise<RenderCompositionResult> => {
  if (!(await videoEditExportSupported())) {
    throw new Error(VIDEO_EDIT_RENDER_UNSUPPORTED_MESSAGE);
  }
  if (media.length !== composition.clips.length) {
    throw new Error('The arrangement names media this browser cannot open.');
  }
  const seen: { plan: CompositionRenderPlan | null } = { plan: null };
  const rendered = await runVideoEditWorker(
    { type: 'render-composition', composition, media },
    signal,
    {
      onProgress,
      onPlan: (plan) => {
        seen.plan = plan;
        onPlan?.(plan);
      },
    },
  );
  if (seen.plan === null) throw new Error('The stitched render reported no plan.');
  return { ...rendered, plan: seen.plan };
};
