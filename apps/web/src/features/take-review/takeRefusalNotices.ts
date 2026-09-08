/**
 * What a surface says when a take could not be dropped.
 *
 * One condition the runtime can be in must not reach the operator in two vocabularies, and every
 * surface that refuses over it refuses for the same reason. The sentences live beside
 * `takeDiscardQuestion`, the question those same surfaces ask before the act, so the words a take
 * is destroyed and refused with are read together rather than kept in step by hand.
 */

/*
 * Every act that clears a take refuses for one reason: a recorder attempt or its on-device transcode
 * still owns the bytes, so the take is still finalizing. That holds for the retake too, whose one
 * boolean could in principle also mean a browser that cannot capture — but `StudioApp` withholds the
 * action entirely unless capture is supported, and `restartCapture` re-checks the same fact before
 * it touches the take, so the discard is the only step left that can say no. The condition clears
 * itself within the finalization bound, which is why this asks for a retry rather than offering one,
 * and why the surface stays open with every control live instead of closing over a take the runtime
 * still holds.
 */
export const TAKE_STILL_FINALIZING_NOTICE =
  'This take is still finishing, so nothing was discarded. Try again in a moment.';

/*
 * The same condition, said differently, because the act is different. A Project's Record press
 * starts a capture rather than clearing a take, so the operator is not waiting on a discard to land
 * and telling them to press again would point at the wrong button: what they have to do first is
 * finish the take that is already running. Naming both halves — nothing started, nothing discarded —
 * is what keeps the sentence honest about a press that touched neither.
 */
export const PROJECT_RECORDING_TAKE_IN_PROGRESS_NOTICE =
  'Finish the current take first. Nothing was started, and nothing was discarded.';
