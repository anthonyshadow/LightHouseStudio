import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useRef, useState } from 'react';
import {
  Button,
  ConfirmationRequestDialog,
  StatusNotice,
  useConfirmationRequest,
  type ConfirmationRequestOptions,
} from '../../ui';
import type { RecordingController } from '../recording/types';
import type { SaveVideoState } from '../saved-videos/useSaveVideo';
import { media } from '../../ui/media';
import { ActionMenu, type ActionMenuItem } from '../../ui/primitives/ActionMenu';
import { takeDiscardQuestion } from './takeDiscardQuestion';
import { TAKE_STILL_FINALIZING_NOTICE } from './takeRefusalNotices';

/** A secondary action, plus the shorter label the persistent control bar shows it under. */
type TakeAction = ActionMenuItem & { readonly compactLabel?: string };

/**
 * The persistent control bar's inline rendering of the list the panel hands to `ActionMenu`.
 *
 * The second renderer of the same actions, taking them the same way the menu does — as a prop —
 * so the two presentations stay one description of what a take can do. A fragment of buttons, not
 * a box: the row's own flex and grid rules address these as direct children.
 */
const CompactTakeActions = ({ actions }: { readonly actions: readonly TakeAction[] }) => (
  <>
    {actions.map((action) => (
      <Button
        key={action.id}
        variant="secondary"
        disabled={action.disabled ?? false}
        {...(action.description === undefined ? {} : { title: action.description })}
        /*
         * The pressed control is its own focus-return target, read from the event rather than
         * taken from the menu's selection contract: nothing in this row is unmounted by a press,
         * so the button that was pressed is the one focus should come back to.
         */
        onClick={(event) => action.onSelect(event.currentTarget)}
      >
        {action.compactLabel ?? action.label}
      </Button>
    ))}
  </>
);

export type TakeReviewActionsProps = {
  recording: RecordingController;
  presentation?: 'panel' | 'control-bar';
  onCloseTake?: () => void;
  onDiscardTake?: () => void;
  /**
   * Drops this take and brings the camera back, in that order and in one owner. Answers false when
   * the act did not run, which here means one thing: the discard refused, so nothing happened and
   * the take is still on the stage. Absent wherever the loop is not offered — inside a Project, over
   * a streamed source, or on a browser that cannot capture — so this surface never has to work out
   * whether it exists, and so the camera the owner also checks for is never the reason for a false.
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
   * Where focus goes when the shared dialog closes. Written by the ask itself and by nothing else,
   * so the target always belongs to the press that opened the dialog on screen: a trigger recorded
   * by one action and left standing would be handed to the next action's dialog, and by then the
   * menu that owned it may not even be mounted — focus would land on a detached element, which is
   * to say on the document body.
   */
  const returnFocusRef = useRef<HTMLElement | null>(null);
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

  /**
   * Poses one press's question, with focus returning to the control that made it.
   *
   * Selecting a menu item closes the menu, so a dialog opened from one can only return to the
   * trigger — the single element that survives the selection. A control that outlives its own
   * dialog, like either presentation's inline Discard, simply hands over itself.
   */
  const askFrom = (trigger: HTMLElement | null, question: ConfirmationRequestOptions) => {
    returnFocusRef.current = trigger;
    return confirmation.ask(question);
  };

  const closeTake = () => {
    setRefusal(null);
    if (!clearTake()) return;
    onCloseTake?.();
  };

  const discard = async (trigger: HTMLElement | null) => {
    setRefusal(null);
    if (
      !(await askFrom(trigger, {
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
   *
   * Its refusal is the same one `clearTake` reports, and gets the same sentence: the act begins with
   * a discard, and the only other thing that could have stopped it is a camera this surface is not
   * offered on in the first place.
   */
  const recordAnotherTake = async (
    trigger: HTMLButtonElement | null,
    restart: () => boolean,
  ): Promise<void> => {
    setRefusal(null);
    // Skipped once the take is saved, for the same reason `Close without saving` skips it: the
    // durable copy is in Assets and this press destroys nothing that cannot be reopened.
    if (unsaved && !(await askFrom(trigger, takeDiscardQuestion('retake')))) return;
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
        <Button
          variant="danger"
          disabled={locked || saving}
          onClick={(event) => void discard(event.currentTarget)}
        >
          Discard
        </Button>
      ) : null}
      {compact ? (
        <CompactTakeActions actions={secondaryActions} />
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
           * The row's rules are written for buttons — a nowrap label that may shrink to nothing —
           * so a sentence needs both to wrap and to claim a line of its own wherever the container
           * allows one. Both presentations wrap now, so both get the whole flex row, and the grid
           * span covers each one's narrow breakpoint.
           */
          css={{
            whiteSpace: 'normal',
            gridColumn: '1 / -1',
            flexBasis: '100%',
          }}
        >
          {refusal}
        </StatusNotice>
      ) : null}
      <ConfirmationRequestDialog request={confirmation} returnFocusRef={returnFocusRef} />
    </div>
  );
};
