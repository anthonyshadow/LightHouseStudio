import type { ProjectProcessingAttempt } from '@studio/contracts';
import type { ProjectProcessingResultState } from '@studio/domain';
import { VIDEO_TRANSFORM_OPERATION_LABELS } from '../existing-video/videoTransformLabels';

export const projectProcessingCapabilityLabel = (
  capability: ProjectProcessingAttempt['capability'],
): string =>
  capability === 'character-swap' || capability === 'virtual-try-on'
    ? VIDEO_TRANSFORM_OPERATION_LABELS[capability]
    : 'Voice';

/**
 * How each result state reads. One record rather than three parallel switches, so the three strings
 * that describe one state sit together — and `satisfies` makes a fourth state a compile error
 * instead of three `default` clauses quietly describing it as the applied current cut.
 *
 * `superseded` is neutral, not a fault: the operator's own save is the usual way a result gets
 * there, and warning about it is what made a working Project read as broken.
 */
const RESULT_COPY = {
  current: {
    title: () => 'Result ready',
    detail: 'This result is now the current cut. Saving it as a version is a separate step.',
    tone: 'success',
  },
  superseded: {
    title: (capability: string) => `${capability} is in this Project`,
    detail:
      'This run was applied to the Project. Your later work has moved past it, and it is kept in History.',
    tone: 'neutral',
  },
  unapplied: {
    title: (capability: string) => `${capability} result kept, not applied`,
    detail:
      'The Project changed while this run was going, so it was kept instead of replacing what you’re viewing. You can still use it.',
    tone: 'warning',
  },
} as const satisfies Record<
  ProjectProcessingResultState,
  {
    readonly title: (capability: string) => string;
    readonly detail: string;
    readonly tone: 'neutral' | 'success' | 'warning' | 'danger';
  }
>;

export const projectProcessingTitle = (attempt: ProjectProcessingAttempt): string => {
  const capability = projectProcessingCapabilityLabel(attempt.capability);
  switch (attempt.phase) {
    case 'submitting':
      return `Submitting ${capability}`;
    case 'accepted':
      return `${capability} accepted / queued`;
    case 'processing':
      return `${capability} processing`;
    case 'retrieving':
      return `Retrieving ${capability} result`;
    case 'saving-result':
      return `Saving ${capability} result`;
    case 'complete':
      return RESULT_COPY[attempt.result?.state ?? 'current'].title(capability);
    case 'needs-attention':
      return attempt.ambiguous ? 'Submission needs attention' : `${capability} failed`;
    case 'cancelled':
      return `${capability} removed from local queue`;
  }
};

export const projectProcessingDetail = (attempt: ProjectProcessingAttempt): string => {
  switch (attempt.phase) {
    case 'submitting':
      return 'This run is tied to the Project as it is right now. Switching Projects stops only this browser request — it does not prove the provider stopped. Reopen this Project to check the same run.';
    case 'accepted':
      return 'The provider accepted this run. Switching Projects stops only the status checks here; accepted work may continue. Reopening checks the same run without submitting it again.';
    case 'processing':
      return 'This run is still going. It may continue after you close this panel or Project.';
    case 'retrieving':
      return 'Fetching the result. This does not start another run.';
    case 'saving-result':
      return 'The result is being stored and checked before it becomes the current cut.';
    case 'complete':
      return RESULT_COPY[attempt.result?.state ?? 'current'].detail;
    case 'needs-attention':
      return attempt.error?.message ?? 'This run needs you to decide what happens next.';
    case 'cancelled':
      return 'Removed from the queue here. The provider may still finish the work, and may still charge for work it already accepted.';
  }
};

export const projectProcessingTone = (
  attempt: ProjectProcessingAttempt,
): 'neutral' | 'success' | 'warning' | 'danger' => {
  if (attempt.phase === 'complete') return RESULT_COPY[attempt.result?.state ?? 'current'].tone;
  if (attempt.phase === 'needs-attention') return attempt.ambiguous ? 'warning' : 'danger';
  if (attempt.phase === 'cancelled') return 'neutral';
  return 'neutral';
};

/**
 * Live AI cannot reconnect through the durable Project operation authority, so a Project offers the
 * two recoverable visual capabilities only. Stated once, read by the Studio workspace and by the
 * Create task.
 */
export const PROJECT_PROVIDER_START_BLOCKED_REASON =
  "Live AI isn't available inside a Project yet. You can still run Character Swap and Virtual Try-On on this Project's video.";

/**
 * Why starting is unavailable while the controller is still establishing whether this Project
 * already has an accepted operation. Both the Create launchers and the editor's action bar refuse
 * for exactly this reason, so they say it in one voice.
 */
export const PROJECT_PROCESSING_AUTHORITY_PENDING_REASON =
  'Checking whether this Project already has an accepted operation. Starting stays unavailable until that is known, so a second potentially billable submission cannot be created.';

/**
 * Why Voice is refused inside a Project, stated where the choice is offered rather than only after
 * it has been made. Any voice selection blocks the visual Start outright, so a rail entry that let
 * one be set would quietly disable Character Swap.
 */
export const PROJECT_VOICE_UNAVAILABLE_REASON =
  'Voice is not available inside a Project yet. Choosing one would stop Character Swap and Virtual Try-On from starting.';

/** One word for pointing a Project at a video it does not yet have, wherever it is offered. */
export const PROJECT_SET_ORIGINAL_VIDEO_ACTION_LABEL = 'Set as a Project’s original video';

/** One word for adopting a retained result, wherever it is offered. */
export const PROJECT_RESULT_ADOPT_ACTION_LABEL = 'Use this result now';

/** One word for re-adopting a result the Project has already moved past. */
export const PROJECT_RESULT_READOPT_ACTION_LABEL = 'Make this the current cut again';

/** The standing cost warning on any control that leads to a provider submission. */
export const PROJECT_PROCESSING_START_COST_NOTE = 'Starting this can cost money at the provider.';

const BLOCKED_REASON_COPY = {
  archive: {
    ambiguous:
      'Archive is blocked while it is unclear whether the provider accepted this run. Another attempt may be charged twice; use the retry decision first.',
    accepted:
      'Archive is blocked while accepted provider work is running. Leaving or switching does not stop that work or its cost; reopen this Project to reconnect.',
  },
  'create-start': {
    ambiguous:
      'Starting another edit is blocked while it is unclear whether the provider accepted the last run. Resolve that run first, or a second one may be charged too.',
    accepted:
      'Starting another edit is blocked while accepted provider work is running. Let it finish, or remove it from the queue first.',
  },
  'source-removal': {
    ambiguous:
      'Removing the original video is blocked while it is unclear whether the provider accepted this run. Resolve the run first.',
    accepted:
      'Removing the original video is blocked while accepted provider work is running. Cancel it or let it finish first.',
  },
} as const satisfies Record<string, { readonly ambiguous: string; readonly accepted: string }>;

/**
 * Operator copy for an action refused because provider work is still unresolved.
 *
 * Single owner for the `blocksArchive` + `ambiguous` read: every action that has to move a Project
 * out from under an attempt asks the same question, so only the wording varies.
 */
export const projectProcessingBlockedReason = (
  attempt: ProjectProcessingAttempt | null | undefined,
  action: keyof typeof BLOCKED_REASON_COPY,
): string | undefined => {
  if (attempt?.blocksArchive !== true) return undefined;
  const copy = BLOCKED_REASON_COPY[action];
  return attempt.ambiguous ? copy.ambiguous : copy.accepted;
};
