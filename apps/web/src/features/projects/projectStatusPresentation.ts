import type { ListTotal, ProjectContract } from '@studio/contracts';
import { listTotalLabel } from '../../ui';

export const projectStatusLabel = (status: ProjectContract['status']): string =>
  status === 'needs-attention'
    ? 'Needs attention'
    : status.charAt(0).toUpperCase() + status.slice(1);

/**
 * How a Project list states its own size, in words that read on their own: the heading beside it is
 * a separate node, so a bare "3" would not say which list grew or shrank when a live region
 * announces it.
 */
export const projectCountLabel = (total: ListTotal, archived: boolean, term?: string): string =>
  listTotalLabel(
    total,
    archived ? 'archived Project' : 'Project',
    archived ? 'archived Projects' : 'Projects',
    term,
  );
