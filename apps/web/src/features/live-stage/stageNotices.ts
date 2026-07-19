export type StageNoticeSeverity = 'info' | 'warning' | 'error';

export type StageNoticeAction = Readonly<{
  label: string;
  onAction: () => void;
}>;

/**
 * A notice that belongs to the media stage rather than to an individual form.
 * IDs must be stable for the lifetime of the condition so duplicate sources can
 * be collapsed without causing repeated assistive-technology announcements.
 */
export type StageNotice = Readonly<{
  id: string;
  severity: StageNoticeSeverity;
  title: string;
  message?: string;
  priority?: number;
  action?: StageNoticeAction;
  onDismiss?: () => void;
}>;

const defaultPriority: Record<StageNoticeSeverity, number> = {
  error: 300,
  warning: 200,
  info: 100,
};

const severityRank: Record<StageNoticeSeverity, number> = {
  error: 3,
  warning: 2,
  info: 1,
};

const noticePriority = (notice: StageNotice): number =>
  notice.priority ?? defaultPriority[notice.severity];

/**
 * Produces the small, deterministic set rendered over the stage. Later entries
 * with the same ID replace earlier ones only when they are more important.
 */
export const deriveStageNotices = (
  notices: readonly StageNotice[],
  limit = 2,
): readonly StageNotice[] => {
  if (limit <= 0) return [];

  const byId = new Map<string, { notice: StageNotice; index: number }>();

  notices.forEach((notice, index) => {
    const id = notice.id.trim();
    if (!id) return;

    const normalized = id === notice.id ? notice : { ...notice, id };
    const current = byId.get(id);
    if (!current || noticePriority(normalized) > noticePriority(current.notice)) {
      byId.set(id, { notice: normalized, index });
    }
  });

  return [...byId.values()]
    .sort((left, right) => {
      const priorityDifference = noticePriority(right.notice) - noticePriority(left.notice);
      if (priorityDifference !== 0) return priorityDifference;

      const severityDifference =
        severityRank[right.notice.severity] - severityRank[left.notice.severity];
      if (severityDifference !== 0) return severityDifference;

      return left.index - right.index;
    })
    .slice(0, limit)
    .map(({ notice }) => notice);
};
