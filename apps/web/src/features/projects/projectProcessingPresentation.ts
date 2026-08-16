import type { ProjectProcessingAttempt } from '@studio/contracts';

export const projectProcessingCapabilityLabel = (
  capability: ProjectProcessingAttempt['capability'],
): string => {
  if (capability === 'character-swap') return 'Character Swap';
  if (capability === 'virtual-try-on') return 'Virtual Try On';
  return 'Voice';
};

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
      return `Retaining ${capability} result`;
    case 'complete':
      return attempt.result?.historical ? 'Retained in this Project' : 'Result ready';
    case 'needs-attention':
      return attempt.ambiguous ? 'Submission needs attention' : `${capability} failed`;
    case 'cancelled':
      return `${capability} removed from local queue`;
  }
};

export const projectProcessingDetail = (attempt: ProjectProcessingAttempt): string => {
  switch (attempt.phase) {
    case 'submitting':
      return 'The app-owned operation is linked to this exact Project revision before provider contact. Switching Projects stops only this browser request and does not prove provider cancellation; reopen to verify the same operation.';
    case 'accepted':
      return 'The provider accepted this operation. Switching Projects stops only browser status checks; accepted remote work may continue, and reopening checks the same durable operation without submitting it again.';
    case 'processing':
      return 'The accepted provider operation is still running. It may continue after this panel or Project is closed.';
    case 'retrieving':
      return 'Lightframe is retrieving the accepted result without creating another provider submission.';
    case 'saving-result':
      return 'The result is being stored and inspected before it can become resumable Project working media.';
    case 'complete':
      return attempt.result?.historical
        ? 'A valid result for an earlier revision was retained with this Project. It did not replace the current media or create a saved Video Version.'
        : 'The retained result is current durable working media. The Project remains Ready; saving an output Version is a separate later action.';
    case 'needs-attention':
      return attempt.error?.message ?? 'This operation needs an explicit recovery decision.';
    case 'cancelled':
      return 'Local tracking and its queue slot were cleared. The provider may still finish remote work or charge for work it already accepted.';
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
