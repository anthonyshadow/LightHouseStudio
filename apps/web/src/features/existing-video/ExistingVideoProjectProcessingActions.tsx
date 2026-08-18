import { useTheme } from '@emotion/react';
import { useState, type RefObject } from 'react';
import { Button, ConfirmationDialog } from '../../ui';
import {
  projectProcessingCapabilityLabel,
  projectProcessingDetail,
  projectProcessingTitle,
} from '../projects/projectProcessingPresentation';
import type { ProjectProcessingController } from '../projects/useProjectProcessingController';
import {
  actionBarStyles,
  actionButtonsStyles,
  actionSummaryStyles,
} from './ExistingVideoPanel.styles';
import type { ExistingVideoWorkflow } from './useExistingVideoWorkflow';

type ProjectVisualProcessingCapability = Parameters<ProjectProcessingController['start']>[0];

const projectProcessingCommandTitle = (
  phase: ProjectProcessingController['phase'],
): string | null => {
  switch (phase) {
    case 'preparing':
      return 'Saving exact Project setup';
    case 'submitting':
      return 'Submitting linked Project operation';
    case 'retrying':
      return 'Starting explicit Project retry';
    case 'cancelling':
      return 'Requesting verified cancellation';
    case 'loading':
    case 'refreshing':
      return 'Checking Project processing';
    case 'idle':
    case 'error':
      return null;
  }
};

const projectProcessingBlockedDetail = ({
  workflow,
  projectCapability,
  visualUnavailable,
  stepIncomplete,
  authorityReady,
}: {
  readonly workflow: ExistingVideoWorkflow;
  readonly projectCapability: ProjectVisualProcessingCapability | null;
  readonly visualUnavailable: boolean;
  readonly stepIncomplete: boolean;
  readonly authorityReady: boolean;
}): string => {
  if (workflow.voiceSelection?.kind === 'elevenlabs') {
    return 'Project provider Voice remains unavailable because its synchronous response cannot reconnect through the durable Project operation authority. Remove Voice to start the visual operation.';
  }
  if (workflow.voiceSelection?.kind === 'local') {
    return 'Remove Voice before starting Project visual processing. Local Voice can run separately, but its rendered result cannot yet become resumable Project working media.';
  }
  if (projectCapability === null) {
    return 'Project provider Voice remains unavailable. Character Swap and Virtual Try On are the recoverable Project capabilities in this release.';
  }
  if (visualUnavailable) {
    return 'This visual capability is unavailable in the current server configuration.';
  }
  if (stepIncomplete) {
    return `Finish configuring ${projectProcessingCapabilityLabel(projectCapability)} before Start.`;
  }
  if (!authorityReady) {
    return 'Checking whether this Project already has an accepted operation. Start stays unavailable until that is known, so a second potentially billable submission cannot be created.';
  }
  return 'Start creates one explicit potentially billable operation after the exact Project setup is saved.';
};

export const ExistingVideoProjectProcessingActions = ({
  workflow,
  projectProcessing,
  projectCapability,
  stepIncomplete,
  visualUnavailable,
  onRequestDiscard,
  discardButtonRef,
}: {
  readonly workflow: ExistingVideoWorkflow;
  readonly projectProcessing: ProjectProcessingController;
  readonly projectCapability: ProjectVisualProcessingCapability | null;
  readonly stepIncomplete: boolean;
  readonly visualUnavailable: boolean;
  readonly onRequestDiscard: () => void;
  readonly discardButtonRef?: RefObject<HTMLButtonElement | null>;
}) => {
  const theme = useTheme();
  const [retryConfirmationOpen, setRetryConfirmationOpen] = useState(false);
  const projectAttempt = projectProcessing.attempt;
  const commandTitle = projectProcessingCommandTitle(projectProcessing.phase);
  const canRetry = Boolean(
    projectAttempt?.isCurrent && projectAttempt.retryPolicy !== 'not-allowed',
  );
  const retryNeedsDuplicateCostAcknowledgement = projectAttempt?.ambiguous === true;
  const startLabel =
    projectCapability === null
      ? 'Project processing unavailable'
      : `Start Project ${projectProcessingCapabilityLabel(projectCapability)}`;
  const startBlocked =
    projectCapability === null ||
    workflow.voiceSelection !== null ||
    stepIncomplete ||
    visualUnavailable ||
    !projectProcessing.authorityReady;
  const blockedDetail = projectProcessingBlockedDetail({
    workflow,
    projectCapability,
    visualUnavailable,
    stepIncomplete,
    authorityReady: projectProcessing.authorityReady,
  });
  const summaryTitle =
    commandTitle ??
    (projectAttempt ? projectProcessingTitle(projectAttempt) : 'Project processing ready');
  let summaryDetail = projectAttempt ? projectProcessingDetail(projectAttempt) : blockedDetail;
  if (projectProcessing.message !== null) summaryDetail = projectProcessing.message;
  if (projectProcessing.unverifiedOperationId !== null) {
    summaryDetail =
      'Submission status is unverified. Check the same operation; do not start another submission.';
  }

  const renderAction = () => {
    if (projectProcessing.busy) {
      return (
        <Button variant="primary" busy disabled>
          {commandTitle ?? 'Checking status…'}
        </Button>
      );
    }
    if (projectProcessing.unverifiedOperationId !== null) {
      return (
        <Button variant="primary" onClick={() => void projectProcessing.refresh()}>
          Check same operation
        </Button>
      );
    }
    if (projectProcessing.phase === 'error') {
      return (
        <Button
          variant="primary"
          onClick={() =>
            void (projectAttempt ? projectProcessing.reconcile() : projectProcessing.refresh())
          }
        >
          {projectAttempt ? 'Check same operation' : 'Retry status check'}
        </Button>
      );
    }
    if (projectAttempt !== null && projectAttempt.nextPollAfterMs !== null) {
      return (
        <>
          <Button variant="primary" busy disabled>
            {projectAttempt.isCurrent
              ? 'Processing accepted operation…'
              : 'Earlier revision still processing…'}
          </Button>
          {projectAttempt.cancellation === 'available' ? (
            <Button variant="secondary" onClick={() => void projectProcessing.cancel()}>
              Cancel provider operation
            </Button>
          ) : null}
        </>
      );
    }
    if (canRetry) {
      return (
        <Button variant="primary" onClick={() => setRetryConfirmationOpen(true)}>
          Retry as new provider attempt
        </Button>
      );
    }
    if (
      projectProcessing.message &&
      projectAttempt?.phase === 'complete' &&
      projectAttempt.isCurrent
    ) {
      return (
        <Button variant="primary" onClick={() => void projectProcessing.refresh()}>
          Refresh retained result
        </Button>
      );
    }
    if (
      projectCapability !== null &&
      (projectAttempt === null ||
        (!projectAttempt.isCurrent && projectAttempt.nextPollAfterMs === null))
    ) {
      return (
        <Button
          variant="primary"
          disabled={startBlocked}
          onClick={() => void projectProcessing.start(projectCapability)}
        >
          {startLabel}
        </Button>
      );
    }
    if (projectAttempt?.phase === 'complete' && projectAttempt.isCurrent) {
      return (
        <Button variant="primary" disabled>
          Result retained
        </Button>
      );
    }
    return (
      <Button variant="primary" disabled>
        {startLabel}
      </Button>
    );
  };

  return (
    <>
      <div css={actionBarStyles(theme)} aria-label="Project processing actions">
        <div css={actionSummaryStyles(theme)} role="status" aria-live="polite" aria-atomic="true">
          <strong>{summaryTitle}</strong>
          <span>{summaryDetail}</span>
        </div>
        <div css={actionButtonsStyles(theme)}>
          {renderAction()}
          {projectAttempt !== null && projectAttempt.nextPollAfterMs !== null ? (
            <Button ref={discardButtonRef} variant="danger" onClick={onRequestDiscard}>
              Clear local editor
            </Button>
          ) : null}
        </div>
      </div>
      <ConfirmationDialog
        open={retryConfirmationOpen}
        title="Start a new provider attempt?"
        description={
          retryNeedsDuplicateCostAcknowledgement
            ? 'The prior submission may already have incurred provider cost. This explicit retry creates a new operation and may duplicate that cost.'
            : 'Retry creates a new provider submission for the exact saved Project revision and may incur provider cost.'
        }
        confirmLabel={
          retryNeedsDuplicateCostAcknowledgement
            ? 'Acknowledge cost and retry'
            : 'Start new attempt'
        }
        cancelLabel="Keep current attempt"
        onCancel={() => setRetryConfirmationOpen(false)}
        onConfirm={() => {
          setRetryConfirmationOpen(false);
          void projectProcessing.retry();
        }}
      />
    </>
  );
};
