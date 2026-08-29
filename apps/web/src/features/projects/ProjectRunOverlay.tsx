import { useTheme } from '@emotion/react';
import { Button } from '../../ui';
import { BlockingOverlay } from '../../ui/primitives/BlockingOverlay';
import { projectProcessingDetail, projectProcessingTitle } from './projectProcessingPresentation';
import type { ProjectProcessingController } from './useProjectProcessingController';

/**
 * Whether an AI run currently owns this Project.
 *
 * `busy` covers the local command round-trip — including the window between preparing and
 * submitting, where no attempt exists yet — and `active` covers the accepted run the controller is
 * polling. Neither alone spans the whole thing.
 *
 * Two states deliberately do *not* block. An attempt that is not current belongs to an earlier
 * change and cannot replace what is on the stage, so freezing the workspace for it would be a lie.
 * And an unverified submission needs the operator to check it — a scrim there would trap them in
 * front of the one control that resolves it.
 */
export const projectRunInFlight = (controller: ProjectProcessingController | undefined): boolean =>
  controller !== undefined &&
  controller.unverifiedOperationId === null &&
  (controller.busy || (controller.active && controller.attempt?.isCurrent === true));

/**
 * States that an AI run owns the Project, and stops anything else being done to it meanwhile.
 *
 * Scoped to the workspace rather than the whole app on purpose: the run is durable, leaving is
 * safe, and reopening reconciles the same operation without submitting a second one. Trapping the
 * operator would protect nothing.
 */
export const ProjectRunOverlay = ({
  controller,
}: {
  readonly controller: ProjectProcessingController;
}) => {
  const theme = useTheme();
  const attempt = controller.attempt;
  const cancellable = attempt?.cancellation === 'available';

  return (
    <div
      data-project-run-overlay=""
      css={{
        // A grid item sharing the cells the stage and the inspector occupy, so it covers both
        // without adding a track. The area is named by the layout that owns it, which declares two
        // different row lists. The masthead is deliberately outside it: going back to the overview
        // is not an action on the video, and being unable to leave would be a trap.
        position: 'relative',
        zIndex: theme.layers.workspaceBlocking,
        gridColumn: '1 / -1',
        gridRow: 'project-workspace',
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <BlockingOverlay
        tone="heavy"
        title={attempt ? projectProcessingTitle(attempt) : 'Starting this edit…'}
        detail={
          attempt
            ? projectProcessingDetail(attempt)
            : 'Saving the exact change this run belongs to, then sending it.'
        }
      >
        {cancellable ? (
          <Button size="small" variant="danger" onClick={() => void controller.cancel()}>
            Remove from processing queue
          </Button>
        ) : null}
      </BlockingOverlay>
    </div>
  );
};
