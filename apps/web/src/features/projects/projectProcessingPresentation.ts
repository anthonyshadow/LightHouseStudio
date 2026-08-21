import type { ProjectProcessingAttempt } from '@studio/contracts';
import { VIDEO_TRANSFORM_OPERATION_LABELS } from '../existing-video/videoTransformLabels';

export const projectProcessingCapabilityLabel = (
  capability: ProjectProcessingAttempt['capability'],
): string =>
  capability === 'character-swap' || capability === 'virtual-try-on'
    ? VIDEO_TRANSFORM_OPERATION_LABELS[capability]
    : 'Voice';

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
      return attempt.result?.historical ? 'Kept in this Project' : 'Result ready';
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
      return attempt.result?.historical
        ? 'This result is for an earlier change. It was kept, but it did not replace what you’re viewing and no version was saved.'
        : 'This result is now the current cut. Saving it as a version is a separate step.';
    case 'needs-attention':
      return attempt.error?.message ?? 'This run needs you to decide what happens next.';
    case 'cancelled':
      return 'Removed from the queue here. The provider may still finish the work, and may still charge for work it already accepted.';
  }
};

export const projectProcessingTone = (
  attempt: ProjectProcessingAttempt,
): 'neutral' | 'success' | 'warning' | 'danger' => {
  if (attempt.phase === 'complete') return attempt.result?.historical ? 'warning' : 'success';
  if (attempt.phase === 'needs-attention') return attempt.ambiguous ? 'warning' : 'danger';
  if (attempt.phase === 'cancelled') return 'neutral';
  return 'neutral';
};

const BLOCKED_REASON_COPY = {
  archive: {
    ambiguous:
      'Archive is blocked while it is unclear whether the provider accepted this run. Another attempt may be charged twice; use the retry decision first.',
    accepted:
      'Archive is blocked while accepted provider work is running. Leaving or switching does not stop that work or its cost; reopen this Project to reconnect.',
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
