import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { RefObject } from 'react';
import { Button } from '../../ui';
import type { RecordingController } from '../recording/types';

export type TakeReviewActionsProps = {
  recording: RecordingController;
  presentation?: 'panel' | 'control-bar';
  onCloseTake?: () => void;
  onEditVideo?: () => void;
  onOpenVoiceTreatments?: () => void;
  editVideoButtonRef?: RefObject<HTMLButtonElement | null>;
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
  },
});

const downloadStyles = (
  theme: Theme,
  locked: boolean,
  presentation: NonNullable<TakeReviewActionsProps['presentation']>,
): CSSObject => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '2.85rem',
  minWidth: '2.75rem',
  padding: presentation === 'control-bar' ? '0.7rem 1rem' : undefined,
  border: presentation === 'control-bar' ? '1px solid transparent' : undefined,
  borderRadius: theme.radii.medium,
  color: presentation === 'control-bar' ? theme.colors.onAccent : theme.colors.canvas,
  background:
    presentation === 'control-bar'
      ? `linear-gradient(135deg, ${theme.colors.accentStrong}, ${theme.colors.accent})`
      : theme.colors.accent,
  boxShadow: presentation === 'control-bar' ? theme.shadows.soft : undefined,
  fontWeight: 760,
  lineHeight: 1.1,
  textDecoration: 'none',
  pointerEvents: locked ? 'none' : 'auto',
  opacity: locked ? 0.5 : 1,
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
});

export const TakeReviewActions = ({
  recording,
  presentation = 'panel',
  onCloseTake,
  onEditVideo,
  onOpenVoiceTreatments,
  editVideoButtonRef,
}: TakeReviewActionsProps) => {
  const theme = useTheme();
  const artifact = recording.presented;
  const locked = recording.processingState === 'processing';
  const compact = presentation === 'control-bar';

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
    closeTake();
  };

  return (
    <div
      css={actionStyles(theme, presentation)}
      role={compact ? 'group' : undefined}
      aria-label={compact ? 'Recorded take controls' : undefined}
    >
      <a
        href={artifact.objectUrl}
        download={artifact.filename}
        aria-disabled={locked}
        tabIndex={locked ? -1 : undefined}
        css={downloadStyles(theme, locked, presentation)}
        onClick={(event) => {
          if (locked) {
            event.preventDefault();
            return;
          }
          recording.markDownloaded();
        }}
      >
        {compact ? 'Download' : 'Download take'}
      </a>
      {onEditVideo ? (
        <Button
          ref={editVideoButtonRef}
          variant="secondary"
          disabled={locked}
          onClick={onEditVideo}
        >
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
        disabled={locked || !recording.downloaded}
        title={
          recording.downloaded
            ? 'Close review and release the temporary in-memory take.'
            : 'Start a download before releasing this temporary take.'
        }
        onClick={closeTake}
      >
        {compact ? 'Release' : 'Close and release'}
      </Button>
    </div>
  );
};
