import { useTheme, type Theme } from '@emotion/react';
import type { CSSObject } from '@emotion/react';
import { exportPlacementLabel } from '../export-placements';
import { projectExportAspectOf } from '@studio/domain';
import { Button } from '../../ui';
import type { ProjectOutputRenditionMember } from './projectOutputRenditionPreparationStorage';

const listStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  margin: 0,
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  listStyle: 'none',
  '& li': {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.space.sm,
    fontSize: theme.fontSizes.metadata,
  },
  '& li span[data-state]': { color: theme.colors.textMuted },
  '& li span[data-state="failed"]': { color: theme.colors.danger },
});

const headerStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  margin: `0 0 ${theme.space.xs}`,
  fontSize: theme.fontSizes.metadata,
  fontWeight: 640,
});

const stateLabel = (
  member: ProjectOutputRenditionMember,
  index: number,
  active: number,
  total: number,
): string => {
  if (member.outcome === 'stored') return 'Made';
  if (member.outcome === 'failed')
    return `Not made — ${member.reason ?? 'it could not be re-framed'}`;
  if (member.outcome === 'cancelled') return 'Not made — stopped';
  return index === active ? `Re-framing ${index + 1} of ${total}` : 'Waiting';
};

/**
 * What each placement of one save is doing, one row apiece.
 *
 * A set takes minutes, and a single bar cannot say which placement is being made or which ones are
 * already safe — so every member states itself, and the operator can stop the rest knowing what
 * stopping costs. Deliberately static: no transition or animation, so nothing here has to be
 * unwound for reduced motion.
 */
export const ProjectPlacementSetProgress = ({
  members,
  active,
  progress,
  onCancelRemaining,
}: {
  readonly members: readonly ProjectOutputRenditionMember[];
  /** Index of the member being made, or -1 when none is. */
  readonly active: number;
  /** The active member's own 0..1 progress, from the render hook. */
  readonly progress: number;
  readonly onCancelRemaining?: (() => void) | undefined;
}) => {
  const theme = useTheme();
  if (members.length === 0) return null;
  const made = members.filter(({ outcome }) => outcome === 'stored').length;
  const running = active >= 0;
  const overall = members.length === 0 ? 0 : (made + (running ? progress : 0)) / members.length;

  return (
    <div role="status" aria-live="polite" data-placement-set-progress="">
      <p css={headerStyles(theme)}>
        <span>
          {running
            ? `Making ${members.length} placements — ${made} of ${members.length} made`
            : `${made} of ${members.length} placements made`}
        </span>
        {running && onCancelRemaining !== undefined ? (
          <Button size="small" variant="secondary" onClick={onCancelRemaining}>
            Cancel remaining
          </Button>
        ) : null}
      </p>
      <ul css={listStyles(theme)}>
        {members.map((member, index) => (
          <li key={member.specification.aspect}>
            <span>{exportPlacementLabel(projectExportAspectOf(member.specification))}</span>
            <span data-state={member.outcome}>
              {stateLabel(member, index, active, members.length)}
              {index === active ? ` · ${Math.round(progress * 100)}%` : ''}
            </span>
          </li>
        ))}
      </ul>
      {running && onCancelRemaining !== undefined ? (
        <p
          css={{
            margin: `${theme.space.xs} 0 0`,
            fontSize: theme.fontSizes.caption,
            color: theme.colors.textFaint,
          }}
        >
          Placements already made will still be saved.
        </p>
      ) : null}
      <progress value={overall} max={1} css={{ width: '100%', marginTop: theme.space.xs }} />
    </div>
  );
};
