/**
 * The two halves of taking a video in, and what each one is called.
 *
 * `validateExistingVideo` decides between them — it reads the file, and converts it once where the
 * codec is the only thing wrong. This says what that decision looks like to the operator, beside
 * the decision itself, because two surfaces show the same wait: the Project source picker as a
 * status notice, and the Studio workflow through the recording controller's processing state.
 */
export type ExistingVideoIntakePhase = 'checking' | 'converting';

export interface ExistingVideoIntakeNotice {
  /** A name, with no trailing ellipsis: a surface that spells a wait that way adds its own. */
  readonly title: string;
  readonly body: string;
}

/*
 * One wording for each phase, reconciled from the two the surfaces had written separately.
 *
 * They disagreed about how long a conversion takes — the picker said it can take a few minutes and
 * the Studio copy said nothing — and the picker's claim is the true one: converting decodes and
 * re-encodes every frame of the video on this device, so a clip of any length is minutes rather
 * than the moment reading a header takes. That is the sentence worth keeping. An unexplained wait
 * of that length is how an operator comes to cancel work that was going to succeed, which is the
 * whole reason the two phases are named apart rather than shown as one.
 */
export const EXISTING_VIDEO_INTAKE_NOTICES: Readonly<
  Record<ExistingVideoIntakePhase, ExistingVideoIntakeNotice>
> = {
  checking: {
    title: 'Checking video',
    body: 'Checking this video here — its format, its length, and whether it plays. Nothing has been uploaded yet.',
  },
  converting: {
    title: 'Converting video',
    body: 'This video is in a format this app cannot publish, so it is being converted to H.264 on this device first. That can take a few minutes, and nothing is uploaded while it converts.',
  },
};
