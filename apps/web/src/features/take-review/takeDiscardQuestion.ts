import type { ConfirmationRequestOptions } from '../../ui';

/** Which press is about to drop the take. Both of them end at a live camera. */
export type TakeDiscardAct = 'retake' | 'project-recording';

/**
 * What each act puts at stake, beyond the loss itself.
 *
 * Take review keeps the sentence its plain Discard already shows and adds what happens next. The
 * Project launch leads with what it replaces, because the operator pressed Record on a Project and
 * may not have the take in mind at all.
 */
const ACT_DESCRIPTIONS: Record<TakeDiscardAct, string> = {
  retake:
    'It only exists in this browser tab, so it cannot be recovered once you discard it. The camera starts again so you can record.',
  'project-recording':
    'Recording for this Project replaces the take on the stage. It only exists in this browser tab, so it cannot be recovered.',
};

/**
 * The question asked before a take is destroyed on the way back to a live camera.
 *
 * Two acts ask it, from two layers — take review's own **Record another take**, and the Project
 * launch in `useStudioRecordingLaunch` — and they must not drift on what the operator is told is at
 * risk. A leaf string module rather than a shared component, for the reason `captureLabels.ts`
 * gives: consumers in different layers should not drag a component graph across a boundary for
 * copy.
 *
 * Both askers gate it on owned bytes. A URL-backed presentation is a Project source streamed from
 * the server, durable there and not a take this tab holds, so clearing it loses nothing and is
 * never worth a question.
 */
export const takeDiscardQuestion = (act: TakeDiscardAct): ConfirmationRequestOptions => ({
  title: 'Discard this take?',
  description: ACT_DESCRIPTIONS[act],
  // Names both halves of the press. 'Discard take' names only the half nobody came for, and the
  // cancel side stays the primitive's own 'Stay'.
  confirmLabel: 'Discard and record',
  danger: true,
});
