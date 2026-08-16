import { useTheme } from '@emotion/react';
import type { ProjectCurrentResponse } from '@studio/contracts';
import { projectWorkflowProgressStyles } from './ProjectRouteSurface.styles';

type Snapshot = ProjectCurrentResponse['revision']['snapshot'];

/**
 * The single ordered definition of a Project's lifecycle. The workspace tablist derives its tasks
 * from this list so the progress a user reads and the tasks they can open cannot drift apart.
 */
export const PROJECT_WORKFLOW_STEPS = [
  { id: 'source', label: 'Source' },
  { id: 'create', label: 'Create' },
  { id: 'save', label: 'Save' },
  { id: 'history', label: 'History' },
] as const;

export type ProjectWorkflowStepId = (typeof PROJECT_WORKFLOW_STEPS)[number]['id'];

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
  const activeIndex = PROJECT_WORKFLOW_STEPS.findIndex(({ id }) => id === activeStep);

  return (
    <ol
      aria-label="Project workflow progress"
      data-project-workflow-progress=""
      data-variant={variant}
      css={projectWorkflowProgressStyles(theme)}
    >
      {PROJECT_WORKFLOW_STEPS.map((step, index) => (
        <li
          key={step.id}
          aria-label={`Step ${index + 1} of ${PROJECT_WORKFLOW_STEPS.length}: ${step.label}`}
          data-state={index < activeIndex ? 'done' : index === activeIndex ? 'current' : 'upcoming'}
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
