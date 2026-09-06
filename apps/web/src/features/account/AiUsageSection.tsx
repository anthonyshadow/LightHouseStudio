import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { AiUsageLedgerCounts, AiUsageOutcome } from '@studio/contracts';
import { aiUsageSubmittedTotal, formatDateTime, formatDuration } from '@studio/domain';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import {
  aiUsageLedgerQueryOptions,
  currentAiUsageMonthStart,
} from '../../adapters/api-client/aiUsageApi';
import { APP_PATHS } from '../../app/paths';
import { Button, LinkButton, StatusNotice } from '../../ui';
import { LoadingPlaceholder } from '../../ui/primitives/LoadingPlaceholder';
import { Skeleton } from '../../ui/primitives/Skeleton';
import { VIDEO_TRANSFORM_OPERATION_LABELS } from '../existing-video/videoTransformLabels';

/** What each settled outcome means, and what the reader does next about it. */
const OUTCOME_COPY: Readonly<Record<AiUsageOutcome, string>> = {
  succeeded: 'Succeeded: the result was ready to download.',
  failed: 'Failed. A retry is a new submission.',
  ambiguous:
    'Acceptance unknown. The provider may have accepted it; reconcile before retrying, since a retry may duplicate cost.',
  expired: 'Expired before retrieval. Submit again explicitly.',
  cancelled: 'Cancelled. The provider may still have charged.',
};

const RUNNING_COPY = 'Running. See the Dashboard queue.';

/** The labels cover the operations this build offers; a ledger row may name one it does not. */
const OPERATION_LABELS = new Map<string, string>(Object.entries(VIDEO_TRANSFORM_OPERATION_LABELS));

/**
 * What to call the operation a row recorded, falling back to the recorded id itself.
 *
 * A row outlives the vocabulary it was written in: an operation kind that has since been renamed or
 * dropped has no label here, and the reader is still owed what ran. Saying the id is honest —
 * inventing a friendly name for it, or leaving the line blank, would not be.
 */
const operationLabel = (operation: string): string => OPERATION_LABELS.get(operation) ?? operation;

/**
 * The month line. What counts as a submission is the ledger's own statement, so the total comes
 * from `aiUsageSubmittedTotal` rather than from six fields added up here: a sixth outcome would
 * otherwise leave this line quietly under-reporting while both stores refused to compile.
 *
 * `counts.running` is deliberately only ever a *term* of that sum and never a number of its own on
 * screen. The section sits directly under the running-jobs line, which counts the live queue; the
 * ledger counts rows nothing has closed yet, and the two legitimately differ by every submission a
 * crash orphaned before the reconciler reached it. One panel saying "running" twice with two
 * different values would read as a defect rather than as the two different facts it is.
 */
const monthSummary = (counts: AiUsageLedgerCounts): string =>
  `This month: ${aiUsageSubmittedTotal(counts)} submitted. ${counts.succeeded} succeeded, ${counts.failed} failed, ${counts.ambiguous} acceptance unknown, ${counts.expired} expired, ${counts.cancelled} cancelled.`;

/**
 * The panel's own grid styles every `ul`, `li` and trailing `span` inside it, which is right for
 * the two-column rows around this section and wrong for a stack of usage rows. Each selector here
 * carries an attribute so it outranks the parent's plain element rules whatever order Emotion
 * inserts the two classes in — order alone would make the layout a coin flip.
 */
const usageStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
  '& ul[data-ai-usage-list]': {
    display: 'grid',
    gap: theme.space.sm,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  '& li[data-ai-usage-row]': {
    display: 'grid',
    justifyContent: 'start',
    justifyItems: 'start',
    gap: theme.space.xxs,
    padding: theme.space.sm,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.medium,
    background: theme.colors.canvasRaised,
  },
  '& li[data-ai-usage-row] > span': {
    color: theme.colors.textMuted,
    fontWeight: 400,
  },
  '& li[data-ai-usage-row] > strong': { color: theme.colors.text },
});

/** The reserved row. It claims the full width itself: the panel lays list items out with flex. */
const skeletonRowStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  width: '100%',
  gap: theme.space.xxs,
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
});

interface AiUsageSectionProps {
  /** Whose ledger this is. The window is per account, so the query identity has to be too. */
  readonly ownerUserId: string;
  /** Whether the panel holding this section is open, so a closed panel asks the server nothing. */
  readonly open: boolean;
}

/**
 * This month's AI submissions and how they settled, read from the account's usage ledger.
 *
 * It answers "what did AI run this month" for the whole account — the one question Project history
 * cannot answer, because a Project only knows its own runs and a standalone submission belongs to
 * no Project at all. It reports outcomes and durations only: what a provider charged is not
 * recorded anywhere in this product, so this surface never implies it is.
 */
export const AiUsageSection = ({ ownerUserId, open }: AiUsageSectionProps) => {
  const theme = useTheme();
  // Pinned for the life of the mount: a `since` recomputed per render would silently re-key the
  // query the moment a reader had the panel open across midnight on the first of the month.
  const since = useMemo(() => currentAiUsageMonthStart(), []);
  const usage = useInfiniteQuery({
    ...aiUsageLedgerQueryOptions(ownerUserId, since),
    enabled: open,
    staleTime: 30_000,
  });

  const pages = usage.data?.pages;
  // Flattened per page rather than per render: this section re-renders with the panel around it,
  // and the list it draws only changes when a page actually arrives.
  const entries = useMemo(() => pages?.flatMap((page) => page.entries) ?? [], [pages]);
  // The window's counts cover the whole window, so every page states the same ones; the first page
  // is simply the one that is always there once anything has loaded.
  const counts = pages?.[0]?.counts ?? null;

  return (
    <div css={usageStyles(theme)}>
      {usage.isPending ? (
        <LoadingPlaceholder label="Checking your AI activity…" count={2}>
          {() => (
            <span css={skeletonRowStyles(theme)}>
              <Skeleton width="46%" height="1rem" />
              <Skeleton width="78%" />
            </span>
          )}
        </LoadingPlaceholder>
      ) : null}

      {usage.isError ? (
        <StatusNotice role="alert" tone="danger">
          Your AI activity is unavailable right now.{' '}
          <Button size="small" onClick={() => void usage.refetch()}>
            Try again
          </Button>
        </StatusNotice>
      ) : null}

      {/* One guard, two branches: a loaded month either has submissions or is empty, and nothing
          should be able to drift the two conditions apart into showing both or neither. */}
      {counts === null ? null : entries.length === 0 ? (
        <>
          <p>No video transformations this month.</p>
          <LinkButton size="small" href={APP_PATHS.assets}>
            Open Assets
          </LinkButton>
        </>
      ) : (
        <>
          <p>{monthSummary(counts)}</p>
          <ul data-ai-usage-list aria-label="AI transformations this month">
            {entries.map((entry) => (
              <li key={entry.jobId} data-ai-usage-row>
                <strong>{operationLabel(entry.operation)}</strong>
                <span>
                  <time dateTime={entry.submittedAt}>{formatDateTime(entry.submittedAt)}</time> ·{' '}
                  <small>{entry.provider}</small>
                </span>
                {entry.durationMs === null ? null : (
                  <span>
                    {formatDuration(entry.durationMs)}{' '}
                    <small>time to outcome as observed by Lightframe</small>
                  </span>
                )}
                <span>{entry.outcome === null ? RUNNING_COPY : OUTCOME_COPY[entry.outcome]}</span>
                {entry.outcome === null ? (
                  <LinkButton size="small" href={APP_PATHS.dashboard}>
                    Open the Dashboard
                  </LinkButton>
                ) : null}
              </li>
            ))}
          </ul>
          {usage.hasNextPage ? (
            <Button
              size="small"
              busy={usage.isFetchingNextPage}
              onClick={() => void usage.fetchNextPage()}
            >
              Show earlier
            </Button>
          ) : null}
        </>
      )}

      <small>
        Counts and outcomes for video transformations only. Lightframe does not record what the
        provider charged for them, and image and voice transformations are not listed.
      </small>
    </div>
  );
};
