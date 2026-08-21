import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { Button, StatusNotice } from '../../ui';
import type { ExportPlacementRenderPhase } from './useExportPlacementRender';

const progressStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  '& > span': {
    display: 'flex',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  '& progress': { width: '100%' },
});

/**
 * Re-framing progress, stated the way the local editor states it — the same live region, the same
 * percentage, the same offer to stop — because it is the same render.
 */
export const ExportPlacementProgress = ({
  phase,
  progress,
  error,
  onCancel,
}: {
  readonly phase: ExportPlacementRenderPhase;
  readonly progress: number;
  readonly error: string | null;
  readonly onCancel: () => void;
}) => {
  const theme = useTheme();
  if (phase === 'error') {
    return error === null ? null : (
      <StatusNotice role="alert" tone="warning" title="Not re-framed">
        {error}
      </StatusNotice>
    );
  }
  if (phase !== 'rendering') return null;
  return (
    <div css={progressStyles(theme)} role="status" aria-live="polite">
      <span>
        <strong>Re-framing for the placement</strong>
        <span>{Math.round(progress * 100)}%</span>
      </span>
      <progress max={1} value={progress} />
      <Button size="small" variant="quiet" onClick={onCancel}>
        Cancel re-framing
      </Button>
    </div>
  );
};
