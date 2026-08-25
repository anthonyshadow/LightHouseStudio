import { useTheme } from '@emotion/react';
import type { ProjectCurrentResponse } from '@studio/contracts';
import { projectWorkflowProgressStyles } from './ProjectRouteSurface.styles';

type Snapshot = ProjectCurrentResponse['revision']['snapshot'];

/**
 * The single ordered definition of a Project's tasks. The workspace tablist derives its tabs from
 * this list so the tasks a user can open and the progress they read cannot drift apart.
 *
 * `history` is a task but not a step: it is the record of what happened, always available and
 * never something a Project has to reach. Only the first three describe progress.
 */
export const PROJECT_WORKFLOW_STEPS = [
  { id: 'source', label: 'Original' },
  { id: 'create', label: 'Create' },
  { id: 'save', label: 'Save' },
  { id: 'history', label: 'History' },
] as const;

export type ProjectWorkflowStepId = (typeof PROJECT_WORKFLOW_STEPS)[number]['id'];

/** The steps a Project actually moves through, which is the whole list minus the record. */
const PROGRESS_STEPS = PROJECT_WORKFLOW_STEPS.filter(({ id }) => id !== 'history');

/**
 * The domain only ever writes `source`, `creative`, `review` and `complete`; `processing` and
 * `export` exist in the contract but are never persisted, so they fall back to the nearest
 * truthful step rather than inventing a fifth one.
 */
export const stepForSnapshot = (snapshot: Snapshot): ProjectWorkflowStepId => {
  if (snapshot.sourceAssetId === null) return 'source';
  switch (snapshot.workflowPhase) {
    case 'review':
    case 'export':
      return 'save';
    case 'complete':
      return 'history';
    default:
      return 'create';
  }
};

interface ProjectWorkflowProgressProps {
  readonly snapshot: Snapshot;
  /**
   * `masthead` is the compact form for the fixed-height workspace header: it never wraps and drops
   * its labels on narrow viewports, leaving the ordinals and each step's accessible name.
   */
  readonly variant?: 'overview' | 'masthead';
}

/**
 * Where the *Project* stands in its own lifecycle — deliberately not a control. The workspace
 * tablist owns moving between tasks; duplicating that here would give one piece of state two
 * competing owners.
 */
export const ProjectWorkflowProgress = ({
  snapshot,
  variant = 'overview',
}: ProjectWorkflowProgressProps) => {
  const theme = useTheme();
  const activeStep = stepForSnapshot(snapshot);
  // A Project on `history` has been through every step, so none of them is current any more.
  const activeIndex = PROGRESS_STEPS.findIndex(({ id }) => id === activeStep);

  return (
    <ol
      aria-label="Project workflow progress"
      data-project-workflow-progress=""
      data-variant={variant}
      css={projectWorkflowProgressStyles(theme)}
    >
      {PROGRESS_STEPS.map((step, index) => (
        <li
          key={step.id}
          aria-label={`Step ${index + 1} of ${PROGRESS_STEPS.length}: ${step.label}`}
          data-state={
            activeIndex === -1 || index < activeIndex
              ? 'done'
              : index === activeIndex
                ? 'current'
                : 'upcoming'
          }
          {...(index === activeIndex ? { 'aria-current': 'step' as const } : {})}
        >
          <span data-step-ordinal aria-hidden="true">
            {index + 1}
          </span>
          <span data-step-label>{step.label}</span>
        </li>
      ))}
    </ol>
  );
};
