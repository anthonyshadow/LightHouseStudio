import { useTheme } from '@emotion/react';
import { phaseItemStyles, phaseNavStyles } from './ExistingVideoPanel.styles';
import type { ExistingVideoEditorPhase } from './existingVideoPresentation';

const phases: readonly Readonly<{ id: ExistingVideoEditorPhase; label: string }>[] = [
  { id: 'source', label: 'Source' },
  { id: 'edit', label: 'Edit' },
  { id: 'review', label: 'Review' },
];

export const ExistingVideoPhaseIndicator = ({
  current,
}: {
  readonly current: ExistingVideoEditorPhase;
}) => {
  'use memo';

  const theme = useTheme();
  const currentIndex = phases.findIndex(({ id }) => id === current);

  return (
    <nav aria-label="Video editing progress" css={phaseNavStyles(theme)}>
      <ol>
        {phases.map(({ id, label }, index) => {
          const state =
            index === currentIndex ? 'current' : index < currentIndex ? 'complete' : 'upcoming';
          return (
            <li
              key={id}
              css={phaseItemStyles(theme, state)}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span aria-hidden="true">{state === 'complete' ? '✓' : index + 1}</span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
};
