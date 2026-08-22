import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { Button, ConfirmationRequestDialog, useConfirmationRequest } from '../../ui';
import type { RecordingController } from '../recording/types';
import type { SaveVideoState } from '../saved-videos/useSaveVideo';
import { media } from '../../ui/media';
import { ActionMenu, type ActionMenuItem } from '../../ui/primitives/ActionMenu';

/** A secondary action, plus the shorter label the persistent control bar shows it under. */
type TakeAction = ActionMenuItem & { readonly compactLabel?: string };

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
  hasUnsavedChanges?: boolean;
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
  [media.downOrShort('tablet', '36rem')]: {
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
  hasUnsavedChanges,
}: TakeReviewActionsProps) => {
  const theme = useTheme();
  const confirmation = useConfirmationRequest();
  const artifact = recording.presented;
  const locked = recording.processingState === 'processing';
  const compact = presentation === 'control-bar';
  const saving = saveVideoState.status === 'saving' && saveVideoState.artifactId === artifact?.id;
  const saved = saveVideoState.status === 'saved' && saveVideoState.artifactId === artifact?.id;

  if (!artifact) return null;

  const unsaved = !saved && (hasUnsavedChanges ?? true);

  const closeTake = () => {
    recording.discard();
    onCloseTake?.();
  };

  const discard = async () => {
    if (
      !(await confirmation.ask({
        title: 'Discard this take?',
        description:
          'It only exists in this browser tab, so it cannot be recovered once you discard it.',
        confirmLabel: 'Discard take',
        danger: true,
      }))
    ) {
      return;
    }
    recording.discard();
    onDiscardTake?.();
    onCloseTake?.();
  };

  const closeDescription = saved
    ? 'Closes review and clears this take from memory. Anything you already saved stays in Assets.'
    : 'Closes review and clears this take from memory. Nothing was changed since you saved it.';

  /*
   * One list, two presentations. The panel puts these behind an overflow — this is the moment of
   * highest decision pressure in the product, and six peer buttons made every option look equal —
   * while the persistent control bar keeps them inline under shorter labels. Describing them once
   * is what stops the two from drifting apart on which action exists or when it is available.
   */
  const secondaryActions: readonly TakeAction[] = [
    ...(onReplaceSavedVideo
      ? [
          {
            id: 'replace',
            label: 'Replace Saved Version',
            disabled: locked || saving,
            onSelect: onReplaceSavedVideo,
          },
        ]
      : []),
    ...(onEditVideo
      ? [{ id: 'edit', label: 'Edit video', disabled: locked, onSelect: onEditVideo }]
      : []),
    ...(onOpenVoiceTreatments
      ? [
          {
            id: 'voice',
            label: 'Voice treatments',
            compactLabel: 'Voice',
            disabled: locked,
            onSelect: onOpenVoiceTreatments,
          },
        ]
      : []),
    ...(unsaved
      ? []
      : [
          {
            id: 'close',
            label: 'Close without saving',
            compactLabel: 'Close',
            description: closeDescription,
            disabled: locked || saving,
            onSelect: closeTake,
          },
        ]),
  ];

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
      {unsaved ? (
        <Button variant="danger" disabled={locked || saving} onClick={() => void discard()}>
          Discard
        </Button>
      ) : null}
      {compact ? (
        secondaryActions.map((action) => (
          <Button
            key={action.id}
            variant="secondary"
            disabled={action.disabled ?? false}
            {...(action.description === undefined ? {} : { title: action.description })}
            onClick={() => action.onSelect(null)}
          >
            {action.compactLabel ?? action.label}
          </Button>
        ))
      ) : (
        <ActionMenu label="More actions for this take" items={secondaryActions} />
      )}
      {saveVideoState.status === 'error' && saveVideoState.artifactId === artifact.id ? (
        <span role="alert">{saveVideoState.message}</span>
      ) : null}
      <ConfirmationRequestDialog request={confirmation} />
    </div>
  );
};
