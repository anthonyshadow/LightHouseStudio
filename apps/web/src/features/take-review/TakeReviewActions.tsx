import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { Button } from '../../ui';
import type { RecordingController } from '../recording/types';
import type { SaveVideoState } from '../saved-videos/useSaveVideo';

export type TakeReviewActionsProps = {
  recording: RecordingController;
  presentation?: 'panel' | 'control-bar';
  onCloseTake?: () => void;
  onDiscardTake?: () => void;
  onEditVideo?: () => void;
  onOpenVoiceTreatments?: () => void;
  onSaveVideo?: () => void;
  saveVideoState?: SaveVideoState;
  onReplaceSavedVideo?: () => void;
};

const actionStyles = (
  theme: Theme,
  presentation: NonNullable<TakeReviewActionsProps['presentation']>,
): CSSObject => ({
  display: 'flex',
  flexWrap: presentation === 'panel' ? 'wrap' : 'nowrap',
  alignItems: 'stretch',
  justifyContent: 'center',
  gap: theme.space.xs,
  minWidth: 0,
  '& > *': {
    flex: presentation === 'panel' ? '1 1 8rem' : '1 1 0',
    minWidth: 0,
    minHeight: presentation === 'control-bar' ? '2.8rem' : undefined,
    whiteSpace: 'nowrap',
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    gap: '0.3rem',
    '& > *': {
      minHeight: presentation === 'control-bar' ? '2.75rem' : undefined,
      paddingInline: presentation === 'control-bar' ? theme.space.xs : undefined,
      fontSize: presentation === 'control-bar' ? theme.fontSizes.caption : undefined,
    },
    ...(presentation === 'panel'
      ? {
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          '& > *': { width: '100%', minWidth: 0 },
        }
      : {}),
  },
  '@media (max-width: 22.49rem)': {
    ...(presentation === 'control-bar'
      ? {
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          '& > *:first-of-type': { gridColumn: 'span 2' },
        }
      : {}),
  },
});

export const TakeReviewActions = ({
  recording,
  presentation = 'panel',
  onCloseTake,
  onDiscardTake,
  onEditVideo,
  onOpenVoiceTreatments,
  onSaveVideo,
  saveVideoState = { status: 'idle' },
  onReplaceSavedVideo,
}: TakeReviewActionsProps) => {
  const theme = useTheme();
  const artifact = recording.presented;
  const locked = recording.processingState === 'processing';
  const compact = presentation === 'control-bar';
  const saving = saveVideoState.status === 'saving' && saveVideoState.artifactId === artifact?.id;
  const saved = saveVideoState.status === 'saved' && saveVideoState.artifactId === artifact?.id;

  if (!artifact) return null;

  const closeTake = () => {
    recording.discard();
    onCloseTake?.();
  };

  const discard = () => {
    if (
      !window.confirm(
        'Discard this in-memory take? It cannot be recovered after the tab releases it.',
      )
    ) {
      return;
    }
    recording.discard();
    onDiscardTake?.();
    onCloseTake?.();
  };

  return (
    <div
      css={actionStyles(theme, presentation)}
      role={compact ? 'group' : undefined}
      aria-label={compact ? 'Recorded take controls' : undefined}
    >
      {onSaveVideo ? (
        <Button
          variant="primary"
          busy={saving}
          disabled={locked || saving || saved}
          onClick={onSaveVideo}
        >
          {saving ? 'Saving…' : saved ? 'Saved to Assets' : compact ? 'Save' : 'Save to Assets'}
        </Button>
      ) : null}
      {onReplaceSavedVideo ? (
        <Button variant="secondary" disabled={locked || saving} onClick={onReplaceSavedVideo}>
          Replace Saved Version
        </Button>
      ) : null}
      {onEditVideo ? (
        <Button variant="secondary" disabled={locked} onClick={onEditVideo}>
          Edit video
        </Button>
      ) : null}
      <Button variant="danger" disabled={locked} onClick={discard}>
        Discard
      </Button>
      {onOpenVoiceTreatments ? (
        <Button variant="secondary" disabled={locked} onClick={onOpenVoiceTreatments}>
          {compact ? 'Voice' : 'Voice treatments'}
        </Button>
      ) : null}
      <Button
        variant="secondary"
        disabled={locked || !saved}
        title={
          saved
            ? 'Close review and release the temporary in-memory take. The saved gallery copy remains available.'
            : 'Save this video before releasing the temporary take.'
        }
        onClick={closeTake}
      >
        {compact ? 'Release' : 'Close and release'}
      </Button>
      {saveVideoState.status === 'error' && saveVideoState.artifactId === artifact.id ? (
        <span role="alert">{saveVideoState.message}</span>
      ) : null}
    </div>
  );
};
