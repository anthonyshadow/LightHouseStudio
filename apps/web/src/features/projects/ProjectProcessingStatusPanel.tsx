import { Button, StatusNotice } from '../../ui';
import {
  PROJECT_RESULT_ADOPT_ACTION_LABEL,
  projectProcessingCapabilityLabel,
  projectProcessingDetail,
  projectProcessingTitle,
  projectProcessingTone,
} from './projectProcessingPresentation';
import type { ProjectWorkflowStepId } from './ProjectWorkflowProgress';
import type { ProjectProcessingController } from './useProjectProcessingController';
import { useProjectRetainedResultAdoption } from './useProjectRetainedResultAdoption';
import type { ProjectSessionPort } from './useProjectSession';

type AdoptionState = ReturnType<typeof useProjectRetainedResultAdoption>;

/**
 * The control for whatever state the attempt is in.
 *
 * Deliberately no retry here. `controller.retry` carries `acknowledgePossibleDuplicateCost` and is a
 * paid submission; the paid start lives in the Create launchers, beside the cost note and the
 * capability gates. Everything offered here is free: reconcile, refresh, adopt, or a move to
 * another task.
 */
const ProjectProcessingActions = ({
  attempt,
  controller,
  adoption,
  onOpenTask,
}: {
  readonly attempt: NonNullable<ProjectProcessingController['attempt']>;
  readonly controller: ProjectProcessingController;
  readonly adoption: AdoptionState;
  readonly onOpenTask: (task: ProjectWorkflowStepId) => void;
}) => {
  // A failed or ambiguous run always has a free way to re-establish the truth. Previously this
  // appeared only when the controller's own command had errored, so an attempt surfaced from
  // history arrived as a danger notice with nothing to press.
  if (controller.phase === 'error' || attempt.phase === 'needs-attention') {
    return (
      <Button size="small" onClick={() => void controller.reconcile()}>
        Check same operation
      </Button>
    );
  }
  if (attempt.phase === 'cancelled') {
    return (
      <Button size="small" onClick={() => onOpenTask('create')}>
        Start again in Create
      </Button>
    );
  }
  if (attempt.phase !== 'complete') return null;

  const history = (
    <Button size="small" variant="secondary" onClick={() => onOpenTask('history')}>
      See it in History
    </Button>
  );

  if (attempt.result?.state === 'unapplied') {
    return (
      <div>
        <Button
          size="small"
          variant="primary"
          busy={adoption.busyItemKey === attempt.result.assetId}
          disabled={adoption.busyItemKey !== null}
          onClick={() =>
            void adoption.adoptMedia(
              { kind: 'asset', assetId: attempt.result!.assetId },
              `${projectProcessingCapabilityLabel(attempt.capability)} retained result`,
              attempt.result!.assetId,
            )
          }
        >
          {PROJECT_RESULT_ADOPT_ACTION_LABEL}
        </Button>
        {history}
      </div>
    );
  }
  if (attempt.result?.state === 'superseded') return history;
  return (
    <div>
      <Button size="small" onClick={() => onOpenTask('save')}>
        Save this as a video
      </Button>
      {/* The result landed but the Project summary did not; re-reading it is free and is the only
       * way back to presenting it. */}
      {controller.message ? (
        <Button size="small" variant="secondary" onClick={() => void controller.refresh()}>
          Refresh retained result
        </Button>
      ) : null}
    </div>
  );
};

/**
 * What is running, what came of it, and what to do about it.
 *
 * The rule this panel is held to: **every state that persists without further input carries a
 * control.** A warning with nothing to press is what made a working Project read as broken — the
 * operator concluded they were stuck while every launcher beside them was live. Only genuinely
 * transient states (loading, refreshing) are exempt, and "nothing is happening" renders nothing.
 */
export const ProjectProcessingStatusPanel = ({
  controller,
  session,
  onOpenTask,
}: {
  readonly controller: ProjectProcessingController;
  readonly session: ProjectSessionPort;
  readonly onOpenTask: (task: ProjectWorkflowStepId) => void;
}) => {
  const { attempt, message, phase, unverifiedOperationId } = controller;
  const adoption = useProjectRetainedResultAdoption(session);

  if (unverifiedOperationId !== null) {
    return (
      <StatusNotice role="alert" tone="warning" title="Your last start could not be confirmed">
        <p>
          The run was recorded here, but the reply never arrived. Check that same run — starting
          another one could be charged twice.
        </p>
        <Button size="small" onClick={() => void controller.refresh()}>
          Check same operation
        </Button>
      </StatusNotice>
    );
  }

  if (attempt !== null) {
    return (
      <StatusNotice
        role={attempt.phase === 'needs-attention' ? 'alert' : 'status'}
        tone={projectProcessingTone(attempt)}
        title={projectProcessingTitle(attempt)}
      >
        <p>{projectProcessingDetail(attempt)}</p>
        {!attempt.isCurrent && attempt.nextPollAfterMs !== null ? (
          <p>
            This accepted operation belongs to an earlier Project revision. It may finish and be
            retained, but it cannot replace the current media.
          </p>
        ) : null}
        {message ? <p>{message}</p> : null}
        {attempt.cancellation === 'available' ? (
          <div>
            <p>
              Removing this operation stops local tracking and clears the queue slot. The provider
              may still finish remote work or charge for work it already accepted.
            </p>
            <Button
              size="small"
              variant="danger"
              busy={phase === 'cancelling'}
              onClick={() => void controller.cancel()}
            >
              Remove from processing queue
            </Button>
          </div>
        ) : null}
        {adoption.error ? <p role="alert">{adoption.error}</p> : null}
        <ProjectProcessingActions
          attempt={attempt}
          controller={controller}
          adoption={adoption}
          onOpenTask={onOpenTask}
        />
      </StatusNotice>
    );
  }

  if (phase === 'loading' || phase === 'refreshing') {
    return (
      <StatusNotice role="status" tone="neutral" title="Checking this Project’s AI runs">
        Looking for a run that is still going. Checking never starts one.
      </StatusNotice>
    );
  }

  if (phase === 'error') {
    return (
      <StatusNotice role="alert" tone="warning" title="Could not check AI runs">
        <p>{message}</p>
        <Button size="small" onClick={() => void controller.refresh()}>
          Retry status check
        </Button>
      </StatusNotice>
    );
  }

  // Nothing running, nothing pending, nothing wrong. A standing notice saying so is the state this
  // Project is in almost always, and a panel that is always there stops being read.
  return null;
};
