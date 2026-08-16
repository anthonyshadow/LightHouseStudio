import { useTheme } from '@emotion/react';
import type { ProjectCurrentResponse } from '@studio/contracts';
import { projectWorkflowProgressStyles } from './ProjectRouteSurface.styles';

type Snapshot = ProjectCurrentResponse['revision']['snapshot'];

const STEPS = [
  { id: 'source', label: 'Source' },
  { id: 'create', label: 'Create' },
  { id: 'save', label: 'Save' },
  { id: 'history', label: 'History' },
] as const;

type StepId = (typeof STEPS)[number]['id'];

/**
 * The domain only ever writes `source`, `creative`, `review` and `complete`; `processing` and
 * `export` exist in the contract but are never persisted, so they fall back to the nearest
 * truthful step rather than inventing a fifth one.
 */
const stepForSnapshot = (snapshot: Snapshot): StepId => {
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

export const ProjectWorkflowProgress = ({ snapshot }: { readonly snapshot: Snapshot }) => {
  const theme = useTheme();
  const activeStep = stepForSnapshot(snapshot);
  const activeIndex = STEPS.findIndex(({ id }) => id === activeStep);

  return (
    <ol
      aria-label="Project workflow progress"
      data-project-workflow-progress=""
      css={projectWorkflowProgressStyles(theme)}
    >
      {STEPS.map((step, index) => (
        <li
          key={step.id}
          data-state={index < activeIndex ? 'done' : index === activeIndex ? 'current' : 'upcoming'}
          {...(index === activeIndex ? { 'aria-current': 'step' as const } : {})}
        >
          <span data-step-ordinal aria-hidden="true">
            {index + 1}
          </span>
          {step.label}
        </li>
      ))}
    </ol>
  );
};
