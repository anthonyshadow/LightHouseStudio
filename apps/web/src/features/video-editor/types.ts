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
  playheadMs: number;
  onPlayheadChange: (playheadMs: number) => void;
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
