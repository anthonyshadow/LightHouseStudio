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
