import { useTheme } from '@emotion/react';
import { useState, type RefObject } from 'react';
import type { VideoProcessingOperationCapability } from '@studio/contracts';
import { Button } from '../../ui';
import type { ProjectProcessingController } from '../projects/useProjectProcessingController';
import type { SaveVideoState } from '../saved-videos/useSaveVideo';
import {
  actionBarStyles,
  actionButtonsStyles,
  actionSummaryStyles,
} from './ExistingVideoPanel.styles';
import { ExistingVideoProjectProcessingActions } from './ExistingVideoProjectProcessingActions';
import {
  existingVideoStepIsComplete,
  planSummary,
  visualToolLabel,
} from './existingVideoPresentation';
import { operationForModel } from './existingVideoWorkflowPolicy';
import type { ExistingVideoWorkflow } from './useExistingVideoWorkflow';

export interface ExistingVideoActionBarProps {
  readonly workflow: ExistingVideoWorkflow;
  readonly videoProcessingAvailable: boolean;
  readonly activeVisualCapability?: VideoProcessingOperationCapability;
  readonly onFinish: () => void;
  readonly onEditSelected: () => void;
  readonly onStartOver: () => void;
  readonly onRequestDiscard: () => void;
  readonly discardButtonRef?: RefObject<HTMLButtonElement | null>;
  readonly onSaveVideo?: () => void;
  readonly saveVideoState?: SaveVideoState;
  readonly providerStartBlockedReason?: string;
  readonly projectProcessing?: ProjectProcessingController;
}

const readyActionLabel = (workflow: ExistingVideoWorkflow): string => {
  const step = workflow.steps[0];
  const voice = workflow.voiceSelection;
  if (step && voice && workflow.phase === 'error' && workflow.completedStepCount > 0) {
    return `Retry ${voice.voiceName} on ${visualToolLabel(step)} result`;
  }
  const retryPrefix = workflow.phase === 'error' ? 'Start new submission · ' : '';
  if (step && voice) return `${retryPrefix}Apply ${visualToolLabel(step)}, then ${voice.voiceName}`;
  if (step) return `${retryPrefix}Apply ${visualToolLabel(step)}`;
  if (voice) return `Apply ${voice.voiceName}${voice.kind === 'local' ? ' locally' : ''}`;
  return 'Review and Save';
};

export const ExistingVideoActionBar = ({
  workflow,
  videoProcessingAvailable,
  activeVisualCapability,
  onFinish,
  onEditSelected,
  onStartOver,
  onRequestDiscard,
  discardButtonRef,
  onSaveVideo,
  saveVideoState = { status: 'idle' },
  providerStartBlockedReason,
  projectProcessing,
}: ExistingVideoActionBarProps) => {
  const theme = useTheme();
  const [retryConfirmationOpen, setRetryConfirmationOpen] = useState(false);
  const step = workflow.steps[0];
  const plan = planSummary(workflow);
  const stepIncomplete = Boolean(
    step &&
    !existingVideoStepIsComplete(
      step,
      step.modelId === 'lucy-latest' && activeVisualCapability?.referencePolicy === 'required',
    ),
  );
  const visualUnavailable = Boolean(
    step && !(activeVisualCapability?.available ?? videoProcessingAvailable),
  );
  const saving =
    saveVideoState.status === 'saving' && saveVideoState.artifactId === workflow.result?.id;
  const saved =
    saveVideoState.status === 'saved' && saveVideoState.artifactId === workflow.result?.id;
  const providerBacked = Boolean(step || workflow.voiceSelection?.kind === 'elevenlabs');
  const providerStartBlocked = providerBacked ? providerStartBlockedReason : undefined;

  const projectCapability = step ? operationForModel(step.modelId) : null;
  const localVoiceOnly = step === undefined && workflow.voiceSelection?.kind === 'local';
  if (
    projectProcessing &&
    !localVoiceOnly &&
    (providerBacked || projectProcessing.attempt !== null)
  ) {
    return (
      <ExistingVideoProjectProcessingActions
        theme={theme}
        workflow={workflow}
        projectProcessing={projectProcessing}
        projectCapability={projectCapability}
        stepIncomplete={stepIncomplete}
        visualUnavailable={visualUnavailable}
        retryConfirmationOpen={retryConfirmationOpen}
        onRetryConfirmationOpenChange={setRetryConfirmationOpen}
        onRequestDiscard={onRequestDiscard}
        {...(discardButtonRef ? { discardButtonRef } : {})}
      />
    );
  }

  if (workflow.phase === 'complete') {
    return (
      <div css={actionBarStyles(theme)} aria-label="Result actions">
        <div css={actionSummaryStyles(theme)} role="status" aria-live="polite">
          <strong>{saved ? 'Saved to gallery' : 'Result ready'}</strong>
          <span>
            {saved
              ? 'Open Saved Videos when you are ready to download.'
              : 'Compare Original and Result, then save or continue editing.'}
          </span>
        </div>
        <div css={actionButtonsStyles(theme)}>
          {workflow.result && onSaveVideo ? (
            <Button
              variant="primary"
              busy={saving}
              disabled={saving || saved}
              onClick={onSaveVideo}
            >
              {saving ? 'Saving…' : saved ? 'Saved to Assets' : 'Save to Assets'}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onEditSelected}>
            Edit {workflow.comparison}
          </Button>
          <Button variant="secondary" onClick={onStartOver}>
            Start over from original
          </Button>
          <Button ref={discardButtonRef} variant="danger" onClick={onRequestDiscard}>
            Discard video and result
          </Button>
        </div>
      </div>
    );
  }

  if (workflow.retryJob) {
    return (
      <div css={actionBarStyles(theme)} aria-label="Accepted job recovery">
        <div css={actionSummaryStyles(theme)}>
          <strong>Accepted job interrupted</strong>
          <span>Resume checks the same accepted job and creates no new submission.</span>
        </div>
        <div css={actionButtonsStyles(theme)}>
          <Button
            variant="primary"
            disabled={Boolean(providerStartBlockedReason)}
            onClick={() => void workflow.retryExistingJob()}
          >
            Resume accepted job · no new submission
          </Button>
          {providerStartBlockedReason ? <span>{providerStartBlockedReason}</span> : null}
        </div>
      </div>
    );
  }

  if (workflow.pendingVisual) {
    return (
      <div css={actionBarStyles(theme)} aria-label="Local finalization recovery">
        <div css={actionSummaryStyles(theme)}>
          <strong>Visual result retained</strong>
          <span>Retry source-audio restoration locally without another provider submission.</span>
        </div>
        <div css={actionButtonsStyles(theme)}>
          <Button variant="primary" onClick={() => void workflow.retryFinalization()}>
            Retry local audio restoration
          </Button>
        </div>
      </div>
    );
  }

  if (workflow.active) {
    const cancelable = !workflow.acceptedSubmission;
    const cancelLabel =
      workflow.phase === 'validating'
        ? 'Cancel check'
        : workflow.phase === 'voice-processing'
          ? 'Cancel voice processing'
          : 'Cancel before submission';
    return (
      <div css={actionBarStyles(theme)} aria-label="Processing actions">
        <div css={actionSummaryStyles(theme)} role="status" aria-live="polite">
          <strong>{workflow.operation?.title ?? 'Preparing your video…'}</strong>
          <span>
            {workflow.operation?.detail ?? 'The current healthy video remains available.'}
          </span>
        </div>
        <div css={actionButtonsStyles(theme)}>
          {cancelable ? (
            <Button variant="secondary" onClick={workflow.cancelBeforeAcceptance}>
              {cancelLabel}
            </Button>
          ) : (
            <Button variant="primary" busy disabled>
              Processing accepted job…
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div css={actionBarStyles(theme)} aria-label="Editing actions">
      <div css={actionSummaryStyles(theme)}>
        <strong>
          {stepIncomplete
            ? `Finish configuring ${step ? visualToolLabel(step) : 'the edit'}`
            : plan.title}
        </strong>
        <span>
          {visualUnavailable
            ? 'Visual processing is unavailable. The source can still be reviewed and saved.'
            : (providerStartBlocked ?? plan.detail)}
        </span>
      </div>
      <div css={actionButtonsStyles(theme)}>
        <Button
          variant="primary"
          disabled={stepIncomplete || visualUnavailable || Boolean(providerStartBlocked)}
          onClick={() => {
            if (!step && !workflow.voiceSelection) onFinish();
            else void workflow.submitPlan();
          }}
        >
          {readyActionLabel(workflow)}
        </Button>
      </div>
    </div>
  );
};
