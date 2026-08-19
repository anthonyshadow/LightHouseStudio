import type { ProjectContract } from '@studio/contracts';

export const projectStatusLabel = (status: ProjectContract['status']): string =>
  status === 'needs-attention'
    ? 'Needs attention'
    : status.charAt(0).toUpperCase() + status.slice(1);
