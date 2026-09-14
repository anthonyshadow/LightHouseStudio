import { useId, useState } from 'react';
import { PROJECT_RECORDING_TAKE_IN_PROGRESS_NOTICE } from '../take-review/takeRefusalNotices';

/**
 * Why a Record press for a Project's source slot started nothing.
 *
 * A union of one, and a union rather than a boolean, because the launch declines for more reasons
 * than it reports: an unsupported browser, no Project to record into, and a source already accepted
 * or busy are each a control this feature has already withheld, so `false` would put a sentence on
 * screen explaining a press nobody could have made. Naming the reason is what keeps those declines
 * silent, and leaves room for a second one — on the condition that a surface has a sentence to
 * render for it. A member nothing renders belongs nowhere near here.
 *
 * It lives beside the surface that renders it rather than beside the hook that answers it, which is
 * the direction this pairing already runs: `useStudioRecordingLaunch` type-imports
 * `ProjectSourceActivity` and `ProjectCreateOperationId` from this feature. Naming this one the
 * other way round is what put `ProjectRouteSurface -> ProjectDetailSurface ->
 * useStudioRecordingLaunch -> ProjectRouteSurface` into the module graph — `import type` included,
 * because the cycle check reads the file's imports rather than what survives to the bundle.
 */
export type ProjectRecordingLaunchRefusal = 'take-in-progress';

/*
 * Why the Record control is off, said before it is pressed rather than after — a browser that
 * cannot capture is not a condition the operator can wait out, so it names the two controls beside
 * it that do work. Nothing answers this from a press: the same fact that would refuse the launch
 * has already disabled the button.
 *
 * Both surfaces that offer a capture read it. It used to live in the original-video section, which
 * stopped rendering its controls once a Project had an original — taking the explanation with it
 * for exactly the Projects where the Media area offers the only Record there is.
 */
export const RECORDING_UNSUPPORTED_NOTICE =
  'This browser cannot record video. Upload a video or use a saved one instead.';

/**
 * What a Record press says when it started nothing, and only while that is still true.
 *
 * A refusal names a condition the runtime is in rather than an event that happened, so it is read
 * against that condition on every render instead of being latched by the press: the sentence
 * arrives with the busy Record control as the take the launch refused for lands in the surface's
 * props, and it leaves with it. Latched, it outlived finalization and was still on screen beside
 * the button that replaces Record once the take is ready — telling the operator to finish a take
 * they had just finished.
 *
 * A member added here has to say both halves before it can reach the screen, which is the point of
 * the switch: a refusal with no sentence, or with no condition to hold it up, will not compile.
 */
export const recordingRefusalNotice = (
  refusal: ProjectRecordingLaunchRefusal | null,
  recordingActive: boolean,
): string | null => {
  switch (refusal) {
    case 'take-in-progress':
      // The one prop that carries it: a surface sets this for a take being captured and for one
      // still finalizing alike, which is exactly the span this sentence is true for.
      return recordingActive ? PROJECT_RECORDING_TAKE_IN_PROGRESS_NOTICE : null;
    case null:
      return null;
  }
};

/**
 * The Record control's own state, wherever a Project offers one.
 *
 * Both surfaces that can start a capture need the same four things and used to keep their own copy
 * of each: the id that ties the button to its explanation, the latch that holds a refusal, the rule
 * that a press replaces whatever the last one left, and the two conditions above. Duplicated, a fix
 * to any of them had to be made twice — which is exactly what the swallowed refusal in the Media
 * area turned out to be.
 */
export const useProjectRecordingControl = ({
  onStartRecording,
  recordingActive,
  recordingSupported,
}: {
  readonly onStartRecording: (() => ProjectRecordingLaunchRefusal | null) | undefined;
  readonly recordingActive: boolean;
  readonly recordingSupported: boolean;
}) => {
  const [refusal, setRefusal] = useState<ProjectRecordingLaunchRefusal | null>(null);
  const unsupportedId = useId();
  /*
   * Read only where a launch is offered: elsewhere the button is already off for another reason,
   * and "this browser" would be the wrong one.
   */
  const unsupported = onStartRecording !== undefined && !recordingSupported;
  return {
    unsupported,
    /** The explanation's id while there is one, so the control can point at it and not at air. */
    describedById: unsupported ? unsupportedId : undefined,
    unsupportedId,
    refusalMessage: recordingRefusalNotice(refusal, recordingActive),
    // One write, because the launch answers before this returns: an earlier press's refusal is
    // replaced by this press's, whatever that is, and `null` is how a press that started something
    // clears it.
    press: () => setRefusal(onStartRecording?.() ?? null),
  } as const;
};
