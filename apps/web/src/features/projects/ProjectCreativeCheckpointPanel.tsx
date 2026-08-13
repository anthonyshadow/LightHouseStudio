import { useTheme } from '@emotion/react';
import { Button, StatusNotice } from '../../ui';
import type { useProjectCreativeSessionAdapter } from './useProjectCreativeSessionAdapter';
import type { useProjectWorkingMediaController } from './useProjectWorkingMediaController';

export const PROJECT_PROVIDER_START_BLOCKED_REASON =
  'Project provider processing is unavailable until recoverable Project processing is enabled.';

export const ProjectCreativeCheckpointPanel = ({
  controller,
  workingMedia,
  onChooseAnother,
}: {
  readonly controller: ReturnType<typeof useProjectCreativeSessionAdapter>;
  readonly workingMedia: ReturnType<typeof useProjectWorkingMediaController>;
  readonly onChooseAnother: (
    kind:
      'character' | 'character-variant' | 'outfit' | 'voice' | 'prompt' | 'recipe' | 'reference',
  ) => void;
}) => {
  const theme = useTheme();
  const issue = controller.resourceIssues[0] ?? null;
  return (
    <aside
      data-project-creative-checkpoint=""
      aria-label="Project creative checkpoint"
      css={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.space.sm,
        minWidth: 0,
        padding: theme.space.sm,
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.medium,
        background: theme.colors.canvasRaised,
        '& > div': { minWidth: 0 },
        '& p': { margin: 0 },
        '@media (max-width: 47.99rem)': {
          alignItems: 'stretch',
          flexDirection: 'column',
        },
      }}
    >
      <div>
        <strong>Project creative setup</strong>
        <p>
          Configuration is local until this explicit checkpoint. No provider Start is available in
          Projects yet.
        </p>
        {issue ? (
          <StatusNotice tone="warning" title={issue.historicalLabel} role="status">
            <p>{issue.message}</p>
            <Button size="small" variant="secondary" onClick={() => onChooseAnother(issue.kind)}>
              Choose another
            </Button>
          </StatusNotice>
        ) : controller.message ? (
          <StatusNotice
            tone={controller.phase === 'error' ? 'danger' : 'neutral'}
            role={controller.phase === 'error' ? 'alert' : 'status'}
          >
            {controller.message}
            {controller.message.includes('reference') ? (
              <Button size="small" variant="secondary" onClick={() => onChooseAnother('reference')}>
                Choose another
              </Button>
            ) : null}
          </StatusNotice>
        ) : null}
        {workingMedia.message ? (
          <StatusNotice
            title={
              workingMedia.phase === 'saved'
                ? 'Durable working media ready'
                : workingMedia.phase === 'saving'
                  ? 'Saving working media'
                  : 'Working media not changed'
            }
            tone={
              workingMedia.phase === 'error'
                ? 'danger'
                : workingMedia.phase === 'conflict'
                  ? 'warning'
                  : workingMedia.phase === 'saved'
                    ? 'success'
                    : 'neutral'
            }
            role={
              workingMedia.phase === 'error' || workingMedia.phase === 'conflict'
                ? 'alert'
                : 'status'
            }
          >
            {workingMedia.message}
          </StatusNotice>
        ) : null}
      </div>
      <Button
        variant="primary"
        busy={controller.phase === 'saving'}
        disabled={controller.phase === 'saving'}
        onClick={() => void controller.checkpoint()}
      >
        {controller.phase === 'saving' ? 'Saving setup…' : 'Save creative setup'}
      </Button>
    </aside>
  );
};
