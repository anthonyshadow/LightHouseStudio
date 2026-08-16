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
      <StatusNotice role="alert" tone="warning" title="Submission status is unverified">
        <p>
          The exact app-owned operation is preserved, but its response could not be verified. Check
          status without starting another potentially billable submission.
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
      <StatusNotice role="status" tone="neutral" title="Checking Project processing">
        Looking for a durable current or accepted earlier-revision operation. This check never
        submits provider work.
      </StatusNotice>
    );
  }

  if (phase === 'error') {
    return (
      <StatusNotice role="alert" tone="warning" title="Processing status unavailable">
        <p>{message}</p>
        <Button size="small" onClick={() => void controller.refresh()}>
          Retry status check
        </Button>
      </StatusNotice>
    );
  }

  return (
    <StatusNotice role="status" tone="neutral" title="Recoverable Project processing ready">
      Character Swap and Virtual Try On start only from the explicit Project edit action. The exact
      revision is linked before provider contact. Project provider Voice and live starts remain
      unavailable because they cannot reconnect through this authority.
    </StatusNotice>
  );
};
