import type { VideoEditSpec } from '@studio/domain';
import type { RecordingArtifact, UploadedTakeMetadata } from '../recording/types';

export type VideoEditTool = 'trim' | 'crop' | 'rotate' | 'lighting' | 'filters';

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
  playheadMs: number;
  onPlayheadChange: (playheadMs: number) => void;
  onApplySpec: (spec: VideoEditSpec) => void;
  onCropStart: () => void;
  onCropChange: (spec: VideoEditSpec) => void;
  onCropCommit: () => void;
}>;

export type VideoEditWorkerRequest =
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
  | Readonly<{ type: 'progress'; operationId: number; progress: number }>
  | Readonly<{
      type: 'complete';
      operationId: number;
      blob: Blob;
      mimeType: 'video/mp4';
    }>
  | Readonly<{ type: 'canceled'; operationId: number }>
  | Readonly<{ type: 'error'; operationId: number; message: string }>;
