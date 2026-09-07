import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useRef, useState } from 'react';
import { Button, ConfirmationRequestDialog, StatusNotice, useConfirmationRequest } from '../../ui';
import type { RecordingController } from '../recording/types';
import type { SaveVideoState } from '../saved-videos/useSaveVideo';
import { media } from '../../ui/media';
import { ActionMenu, type ActionMenuItem } from '../../ui/primitives/ActionMenu';
import { takeDiscardQuestion } from './takeDiscardQuestion';

/** A secondary action, plus the shorter label the persistent control bar shows it under. */
type TakeAction = ActionMenuItem & { readonly compactLabel?: string };

/*
 * A discard refuses for one reason: a recorder attempt or its on-device transcode still owns the
 * bytes, so the take is still finalizing. It clears itself within the finalization bound, which is
 * why this asks for a retry rather than offering one — and why review stays open with every control
 * live instead of closing over a take the runtime still holds.
 */
const TAKE_STILL_FINALIZING_NOTICE =
  'This take is still finishing, so nothing was discarded. Try again in a moment.';

export type TakeReviewActionsProps = {
  recording: RecordingController;
  presentation?: 'panel' | 'control-bar';
  onCloseTake?: () => void;
  onDiscardTake?: () => void;
  /**
   * Drops this take and brings the camera back, in that order and in one owner. Answers false when
   * the discard refused, in which case nothing happened and the take is still on the stage. Absent
   * wherever the loop is not offered — inside a Project, over a streamed source, or on a browser
   * that cannot capture — so this surface never has to work out whether it exists.
   */
  onRecordAnotherTake?: () => boolean;
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
  /*
   * Both presentations wrap. The compact row used to be `nowrap` over children that could shrink
   * below their own label, which held only while the labels were small: at 200% text zoom the last
   * control's label overflowed its shrunken box in both directions and, being last in paint order,
   * covered the control beside it and took its clicks. The width-based escape hatch below cannot
   * catch that, because `rem` in a media query is measured against the initial root font size and
   * so never notices text zoom at all. Wrapping to a second row is the honest answer: it costs
   * height, which this bar can give, rather than a control nobody can press.
   */
  flexWrap: 'wrap',
  alignItems: 'stretch',
  justifyContent: 'center',
  gap: theme.space.xs,
  minWidth: 0,
  '& > *': {
    flex: presentation === 'panel' ? '1 1 8rem' : '1 1 auto',
    // Never narrower than the label it holds, which is what keeps a control inside its own box.
    minWidth: presentation === 'panel' ? 0 : 'min-content',
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
  onRecordAnotherTake,
  onEditVideo,
  onOpenVoiceTreatments,
  onSaveVideo,
  saveVideoState = { status: 'idle' },
  onReplaceSavedVideo,
  hasUnsavedChanges,
}: TakeReviewActionsProps) => {
  const theme = useTheme();
  const confirmation = useConfirmationRequest();
  const [refusal, setRefusal] = useState<string | null>(null);
  /*
   * Selecting a menu item closes the menu, so a dialog opened from one can only return focus to the
   * trigger — the single element that survives the selection. It stays null for a press from the
   * compact bar, where `OverlayPanel` falls back to the button it captured when the dialog opened.
   */
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  const artifact = recording.presented;
  const locked = recording.processingState === 'processing';
  const compact = presentation === 'control-bar';
  const saving = saveVideoState.status === 'saving' && saveVideoState.artifactId === artifact?.id;
  const saved = saveVideoState.status === 'saved' && saveVideoState.artifactId === artifact?.id;

  if (!artifact) return null;

  const unsaved = !saved && (hasUnsavedChanges ?? true);

  /*
   * The one place this surface reads a discard's answer, so every act that clears a take treats a
   * refusal the same way. Each act clears the notice before it begins, which keeps what is on
   * screen a description of the press the operator just made.
   */
  const clearTake = (): boolean => {
    if (recording.discard()) return true;
    setRefusal(TAKE_STILL_FINALIZING_NOTICE);
    return false;
  };

  const closeTake = () => {
    setRefusal(null);
    if (!clearTake()) return;
    onCloseTake?.();
  };

  const discard = async () => {
    setRefusal(null);
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
    if (!clearTake()) return;
    onDiscardTake?.();
    onCloseTake?.();
  };

  /*
   * Refusals before effects, and exactly one effect: `restart` is the whole act — it discards, ends
   * the handoff and re-acquires, in that order and in its own owner — so nothing here asks for a
   * camera and nothing here closes review. Two idempotent closes already follow from the discard,
   * and only one of them owns focus; a third would fight it.
   */
  const recordAnotherTake = async (
    trigger: HTMLButtonElement | null,
    restart: () => boolean,
  ): Promise<void> => {
    menuTriggerRef.current = trigger;
    setRefusal(null);
    // Skipped once the take is saved, for the same reason `Close without saving` skips it: the
    // durable copy is in Assets and this press destroys nothing that cannot be reopened.
    if (unsaved && !(await confirmation.ask(takeDiscardQuestion('retake')))) return;
    if (!restart()) {
      setRefusal(TAKE_STILL_FINALIZING_NOTICE);
      return;
    }
    onDiscardTake?.();
  };

  const closeDescription = saved
    ? 'Closes review and clears this take from memory. Anything you already saved stays in Assets.'
    : 'Closes review and clears this take from memory. Nothing was changed since you saved it.';

  /*
   * State-switched like `closeDescription`, because this slot is the only place a disabled item can
   * say why it is unavailable — and in the compact bar it is the button's tooltip, the one warning
   * a shortened label cannot carry.
   */
  const retakeDescription = locked
    ? 'Available once processing finishes.'
    : saving
      ? 'Available once the save finishes.'
      : 'Discards this take and starts the camera again.';

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
    ...(onRecordAnotherTake
      ? [
          {
            id: 'retake',
            label: 'Record another take',
            compactLabel: 'Record again',
            description: retakeDescription,
            // No `danger` mark: a second red row beside the inline Discard reads as a second
            // Discard. The confirmation carries the danger treatment instead.
            disabled: locked || saving,
            onSelect: (trigger: HTMLButtonElement | null) => {
              void recordAnotherTake(trigger, onRecordAnotherTake);
            },
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
        /*
         * One of these handlers records a focus-return trigger, which taints the whole list for the
         * refs analysis the moment the list is handed to a function. Nothing here reads `.current`:
         * the write happens in a menu selection, long after this render. Splitting the list to
         * satisfy the analysis would give the two presentations two answers to "does this action
         * exist", which is the drift the single list exists to prevent.
         */
        // eslint-disable-next-line react-hooks/refs -- ref written in an event handler, never read during render
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
      {refusal ? (
        <StatusNotice
          role="alert"
          tone="warning"
          /*
           * The row's rules are written for buttons — a single nowrap line that may shrink to
           * nothing — so a sentence needs both to wrap and to claim a line of its own wherever the
           * container allows one: the whole row where the panel wraps, the whole row at the compact
           * bar's grid breakpoint.
           */
          css={{
            whiteSpace: 'normal',
            gridColumn: '1 / -1',
            ...(compact ? {} : { flexBasis: '100%' }),
          }}
        >
          {refusal}
        </StatusNotice>
      ) : null}
      <ConfirmationRequestDialog request={confirmation} returnFocusRef={menuTriggerRef} />
    </div>
  );
};
