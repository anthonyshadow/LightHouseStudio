import type {
  ClipAudioConformance,
  ClipVideoConformance,
  Composition,
  CompositionAudioTarget,
  CompositionVideoTarget,
  SubtitleCue,
  VideoEditSpec,
} from '@studio/domain';
import type { RecordingArtifact, UploadedTakeMetadata } from '../recording/types';

export type VideoEditTool =
  'trim' | 'crop' | 'rotate' | 'lighting' | 'filters' | 'subtitles' | 'audio';

export type VideoEditSessionPhase =
  | 'closed'
  | 'editing'
  | 'rendering'
  | 'validating'
  | 'awaiting-replacement'
  | 'committing'
  | 'error'
  | 'complete';

export const isVideoEditBusy = (phase: VideoEditSessionPhase): boolean =>
  phase === 'rendering' || phase === 'validating' || phase === 'committing';

export const formatVideoEditTime = (milliseconds: number): string => {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

export const formatVideoEditTimelineTime = (milliseconds: number): string => {
  const centiseconds = Math.max(0, Math.floor(milliseconds / 10));
  const minutes = Math.floor(centiseconds / 6_000);
  const seconds = Math.floor((centiseconds % 6_000) / 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(
    centiseconds % 100,
  ).padStart(2, '0')}`;
};

/** What the cue list and the timeline lane call a subtitle the operator has not typed into yet. */
export const subtitleCueLabel = (cue: Pick<SubtitleCue, 'text'>): string =>
  cue.text.trim() === '' ? 'Untitled subtitle' : cue.text.trim();

export type VideoEditSource = Readonly<{
  artifact: RecordingArtifact;
  metadata: UploadedTakeMetadata;
}>;

export type VideoEditStagePreviewContract = Readonly<{
  spec: VideoEditSpec;
  sourceWidth: number;
  sourceHeight: number;
  activeTool: VideoEditTool;
  showingBefore: boolean;
  splitComparison: boolean;
  // No `playheadMs`: the preview reports the playhead up and never reads it back, so carrying it
  // here would invalidate this contract at `timeupdate` rate for a value nothing consumes.
  onPlayheadChange: (playheadMs: number) => void;
  onApplySpec: (spec: VideoEditSpec) => void;
  onCropStart: () => void;
  onCropChange: (spec: VideoEditSpec) => void;
  onCropCommit: () => void;
}>;

/**
 * Where one clip's bytes are and what frame they have — the media record's own facts, index-aligned
 * with the arrangement's clips. The worker streams each clip by HTTP ranges from `url`, so an
 * arrangement of a hundred clips never holds a hundred files. Sound is not described here: the
 * worker reads each clip's audio track itself, which is the only place its format is known.
 */
export type CompositionRenderMedia = Readonly<{
  /** Absolute and same-origin: a worker resolves nothing against a page. */
  url: string;
  mimeType: string;
  /** Named in refusals, so an operator knows which clip to remove or mute. */
  filename: string;
  width: number;
  height: number;
}>;

/**
 * What the render decided before it paid for anything: the one frame every clip is drawn into and
 * what that does to each clip, and the same for sound — or `null` when no clip contributes any.
 */
export type CompositionRenderPlan = Readonly<{
  durationMs: number;
  video: Readonly<{ target: CompositionVideoTarget; clips: readonly ClipVideoConformance[] }>;
  audio: Readonly<{
    target: CompositionAudioTarget;
    /** The clips' own rate could not be encoded, so the domain's fallback format was used. */
    fellBack: boolean;
    clips: readonly ClipAudioConformance[];
  }> | null;
}>;

export type VideoEditWorkerRequest =
  | Readonly<{
      type: 'render-composition';
      operationId: number;
      composition: Composition;
      media: readonly CompositionRenderMedia[];
    }>
  | Readonly<{
      type: 'render';
      operationId: number;
      source: Blob;
      spec: VideoEditSpec;
      sourceWidth: number;
      sourceHeight: number;
      requireAudio: boolean;
      /**
       * Scales the cropped frame to an exact destination size. `null` keeps the size the crop
       * itself produces, which is what every local edit does.
       */
      targetResolution: { readonly width: number; readonly height: number } | null;
      /** `false` drops the audio track instead of transcoding it. */
      includeAudio: boolean;
    }>
  | Readonly<{ type: 'cancel'; operationId: number }>;

export type VideoEditWorkerResponse =
  | Readonly<{ type: 'plan'; operationId: number; plan: CompositionRenderPlan }>
  | Readonly<{ type: 'progress'; operationId: number; progress: number }>
  | Readonly<{
      type: 'complete';
      operationId: number;
      blob: Blob;
      mimeType: 'video/mp4';
    }>
  | Readonly<{ type: 'canceled'; operationId: number }>
  | Readonly<{ type: 'error'; operationId: number; message: string }>;
