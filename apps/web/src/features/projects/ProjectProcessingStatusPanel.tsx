import { Button, StatusNotice } from '../../ui';
import {
  projectProcessingDetail,
  projectProcessingTitle,
  projectProcessingTone,
} from './projectProcessingPresentation';
import type { ProjectProcessingController } from './useProjectProcessingController';

export const ProjectProcessingStatusPanel = ({
  controller,
}: {
  readonly controller: ProjectProcessingController;
}) => {
  const { attempt, message, phase, unverifiedOperationId } = controller;

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
        {phase === 'error' ? (
          <Button size="small" onClick={() => void controller.reconcile()}>
            Check same operation
          </Button>
        ) : message && attempt.phase === 'complete' && attempt.isCurrent ? (
          <Button size="small" onClick={() => void controller.refresh()}>
            Refresh retained result
          </Button>
        ) : null}
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
