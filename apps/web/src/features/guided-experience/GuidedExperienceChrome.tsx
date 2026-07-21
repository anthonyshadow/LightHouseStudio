import { useTheme } from '@emotion/react';
import type { RecordingArtifact } from '../recording/types';
import type { GuidedFlowState, ProjectStorageState } from '../guided-flow';
import { Button, StatusNotice } from '../../ui';
import {
  guidedHeaderStyles,
  guidedTopLineStyles,
  progressListStyles,
  progressStepStyles,
  quietNavStyles,
  savedBadgeStyles,
  stageHeaderStyles,
  stepNumberStyles,
} from './GuidedExperience.styles';
import { GUIDED_STAGES, stageForStatus } from './guidedExperienceModel';

export const GuidedProgressHeader = ({ flow }: { flow: GuidedFlowState }) => {
  const theme = useTheme();
  const current = GUIDED_STAGES.findIndex((stage) => stage.id === stageForStatus(flow.status));
  return (
    <header css={guidedHeaderStyles(theme)}>
      <div css={guidedTopLineStyles(theme)}>
        <div>
          <h1>
            A new way to create. <span>Simple from start to finish.</span>
          </h1>
          <p css={{ margin: `${theme.space.xxs} 0 0`, color: theme.colors.textMuted }}>
            Create a character, go live with AI, record, choose a voice, and download.
          </p>
        </div>
        <div data-guided-nav css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.xs }}>
          <a href="/projects" css={quietNavStyles(theme)}>
            My Projects
          </a>
          <a href="/advanced" css={quietNavStyles(theme)}>
            Advanced Studio
          </a>
        </div>
      </div>
      <nav aria-label="Character video progress">
        <ol css={progressListStyles(theme)}>
          {GUIDED_STAGES.map((stage, index) => {
            const state = index < current ? 'complete' : index === current ? 'current' : 'future';
            return (
              <li
                key={stage.id}
                aria-current={state === 'current' ? 'step' : undefined}
                css={progressStepStyles(theme, state)}
              >
                <span css={stepNumberStyles(theme, state !== 'future')}>
                  {state === 'complete' ? '✓' : index + 1}
                </span>
                <span>
                  <strong>{stage.title}</strong>
                  <span>{stage.subtitle}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </nav>
    </header>
  );
};

export const GuidedStageHeader = ({
  title,
  description,
  storage,
}: {
  title: string;
  description: string;
  storage: ProjectStorageState;
}) => {
  const theme = useTheme();
  return (
    <header css={stageHeaderStyles(theme)}>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <span role="status" css={savedBadgeStyles(theme)}>
        {storage.durable ? '✓ Saved privately in this browser' : '◌ Safe in this tab'}
      </span>
    </header>
  );
};

export const GuidedStorageRecovery = ({
  storage,
  original,
  dismissed,
  onRetry,
  onContinue,
}: {
  storage: ProjectStorageState;
  original: RecordingArtifact | null;
  dismissed: boolean;
  onRetry(): void;
  onContinue(): void;
}) => {
  if (storage.durable || dismissed) return null;
  return (
    <StatusNotice role="alert" tone="warning" title="Browser storage needs attention">
      {storage.notice ?? 'This project is currently retained only in memory.'}
      <div css={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginTop: '.75rem' }}>
        <Button size="small" variant="secondary" onClick={onRetry}>
          Retry Save
        </Button>
        {original ? (
          <a href={original.objectUrl} download={original.filename}>
            Download Original
          </a>
        ) : null}
        <Button size="small" variant="quiet" onClick={onContinue}>
          Continue for This Tab
        </Button>
      </div>
    </StatusNotice>
  );
};
