import { useTheme } from '@emotion/react';
import type { DragEvent, RefObject } from 'react';
import { Button } from '../../ui';
import {
  appliedSummaryStyles,
  dropActionStyles,
  dropZoneStyles,
  processingStyles,
  resultStyles,
} from './ExistingVideoPanel.styles';
import { visualToolLabel } from './existingVideoPresentation';
import type {
  ExistingVideoStep,
  ExistingVideoVoiceSelection,
  ExistingVideoWorkflowPhase,
} from './useExistingVideoWorkflow';
import type { RecordingProcessingOperation } from '../recording/types';

export const ExistingVideoUploadChooser = ({
  phase,
  pickerRef,
  recordingSupported,
  onChooseFiles,
  onDrop,
  onRecordVideo,
  onCancel,
}: {
  phase: ExistingVideoWorkflowPhase;
  pickerRef: RefObject<HTMLInputElement | null>;
  recordingSupported: boolean;
  onChooseFiles: (files: FileList | null) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onRecordVideo?: () => void;
  onCancel: () => void;
}) => {
  const theme = useTheme();
  const validating = phase === 'validating';
  return (
    <div css={dropZoneStyles(theme)} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <div>
        <h2>{validating ? 'Checking your video…' : 'Add a video'}</h2>
        <p>
          Upload from this device or record with the local camera. Nothing is sent to a provider
          until you deliberately apply an AI edit.
        </p>
      </div>
      <input
        ref={pickerRef}
        hidden
        type="file"
        accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm"
        disabled={validating}
        onChange={(event) => {
          onChooseFiles(event.currentTarget.files);
          event.currentTarget.value = '';
        }}
      />
      <div css={dropActionStyles(theme)}>
        <Button variant="primary" busy={validating} onClick={() => pickerRef.current?.click()}>
          Upload from device
        </Button>
        {onRecordVideo ? (
          <Button variant="secondary" disabled={!recordingSupported} onClick={onRecordVideo}>
            Record a local video
          </Button>
        ) : null}
        {validating ? (
          <Button variant="quiet" onClick={onCancel}>
            Cancel check
          </Button>
        ) : null}
      </div>
      <span>MP4/H.264, MOV/H.264, or WebM/VP8 · any aspect ratio · up to 5 minutes</span>
      <span data-secondary-upload-guidance>
        For the best experience, upload 16:9 or 9:16, or use Adjust video after upload to crop to
        16:9 or 9:16.
      </span>
      <span data-drag-only-guidance>Drag and drop a video anywhere in this area</span>
    </div>
  );
};

export const ExistingVideoResultSummary = ({
  activeStep,
  voiceSelection,
}: {
  activeStep: ExistingVideoStep | undefined;
  voiceSelection: ExistingVideoVoiceSelection | null;
}) => {
  const theme = useTheme();
  return (
    <section css={resultStyles(theme)} aria-labelledby="existing-video-result-heading">
      <div>
        <h2 id="existing-video-result-heading">Your result is ready</h2>
        <p>
          Compare Original and Result beside this summary. Save the healthy result, continue editing
          either version, or start over from the original source. Downloads are available from Saved
          Videos.
        </p>
      </div>
      <div css={appliedSummaryStyles(theme)} aria-label="Applied edits">
        {activeStep ? <span>{visualToolLabel(activeStep)}</span> : null}
        {voiceSelection ? <span>Voice · {voiceSelection.voiceName}</span> : null}
        {!activeStep && !voiceSelection ? <span>No AI edits</span> : null}
      </div>
    </section>
  );
};

export const ExistingVideoProcessingStatus = ({
  operation,
  elapsedSeconds,
}: {
  operation: RecordingProcessingOperation | null | undefined;
  elapsedSeconds: number;
}) => {
  const theme = useTheme();
  return (
    <section css={processingStyles(theme)} aria-labelledby="existing-video-processing-heading">
      <span data-processing-mark aria-hidden="true">
        ···
      </span>
      <div>
        <h2 id="existing-video-processing-heading">
          {operation?.title ?? 'Preparing your video…'}
        </h2>
        <p>{operation?.detail ?? 'The last healthy video remains available.'}</p>
        <p>Elapsed {Math.round(elapsedSeconds)}s. Progress percentages are not estimated.</p>
      </div>
    </section>
  );
};
