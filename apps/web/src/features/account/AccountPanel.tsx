import { useTheme } from '@emotion/react';
import type { AuthenticatedSessionResponse } from '@studio/contracts';
import { formatDateTime } from '@studio/domain';
import { useQuery } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { activeVideoJobsQueryOptions } from '../../adapters/api-client/videoJobsApi';
import type { StudioAvailabilityRow } from '../../studio/studioAvailabilityPresentation';
import { OverlayPanel } from '../../ui/primitives/OverlayPanel';

/** One integration row, using exactly the wording the header's status menu already shows. */
export type AccountCapabilityRow = StudioAvailabilityRow;

const PLAN_LABELS = {
  free: 'Free plan',
  plus: 'Plus plan',
  pro: 'Pro plan',
} as const;

const ENTITLEMENT_LABELS = {
  'local-camera': 'Local camera recording',
  'upload-video': 'Upload a video',
  'character-swap': 'Character Swap',
  'virtual-try-on': 'Virtual Try-On',
  'voice-effects': 'Voice effects',
  'video-editor': 'Video editor',
  'saved-characters': 'Saved Characters',
  'saved-outfits': 'Saved Outfits',
  'saved-videos': 'Saved Videos',
} as const;

const limitLabel = (value: number | null): string => (value === null ? 'No limit' : String(value));

interface AccountPanelProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly session: AuthenticatedSessionResponse;
  readonly capabilityRows: readonly AccountCapabilityRow[];
  readonly capabilityFootnote: string;
}

/**
 * A read-only account summary built entirely from data the product already holds: the session in
 * memory, the capability wording the header already derives, and the bounded active-jobs list.
 * It adds no polling — the jobs query runs only while the panel is open and shares the cache the
 * Dashboard already maintains.
 */
export const AccountPanel = ({
  open,
  onClose,
  returnFocusRef,
  session,
  capabilityRows,
  capabilityFootnote,
}: AccountPanelProps) => {
  const theme = useTheme();
  const { user, entitlements } = session;
  const activeJobsQuery = useQuery({
    ...activeVideoJobsQueryOptions(user.id),
    enabled: open,
    staleTime: 30_000,
  });
  const activeJobCount = activeJobsQuery.data?.jobs.length ?? null;

  return (
    <OverlayPanel
      open={open}
      onClose={onClose}
      title="Account"
      description="Who is signed in, what this plan includes, and what is configured."
      returnFocusRef={returnFocusRef}
      placement="right"
      size="standard"
    >
      <div
        css={{
          display: 'grid',
          gap: theme.space.lg,
          '& section': { display: 'grid', gap: theme.space.xs },
          '& h3': {
            margin: 0,
            color: theme.colors.text,
            fontSize: theme.fontSizes.body,
          },
          '& dl': {
            display: 'grid',
            margin: 0,
            gap: '0.35rem',
          },
          '& dl > div': {
            display: 'flex',
            justifyContent: 'space-between',
            gap: theme.space.sm,
            minWidth: 0,
          },
          '& dt': {
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes.metadata,
          },
          '& dd': {
            margin: 0,
            overflow: 'hidden',
            color: theme.colors.text,
            fontSize: theme.fontSizes.metadata,
            fontWeight: 700,
            textAlign: 'end',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
          '& ul': {
            display: 'grid',
            margin: 0,
            padding: 0,
            gap: '0.3rem',
            listStyle: 'none',
          },
          '& li': {
            display: 'flex',
            justifyContent: 'space-between',
            gap: theme.space.sm,
            color: theme.colors.text,
            fontSize: theme.fontSizes.metadata,
          },
          '& li > span:last-of-type': { color: theme.colors.textMuted, fontWeight: 700 },
          '& p': {
            margin: 0,
            color: theme.colors.textMuted,
            fontSize: theme.fontSizes.metadata,
            lineHeight: 1.5,
          },
          '& small': { color: theme.colors.textFaint, fontSize: theme.fontSizes.caption },
        }}
      >
        <section aria-labelledby="account-panel-identity">
          <h3 id="account-panel-identity">Identity</h3>
          <dl>
            <div>
              <dt>Name</dt>
              <dd>{user.displayName}</dd>
            </div>
            <div>
              <dt>Sign-in</dt>
              <dd title={user.login}>{user.login}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd title={user.email}>{user.email}</dd>
            </div>
            <div>
              <dt>Plan</dt>
              <dd>{PLAN_LABELS[user.planId]}</dd>
            </div>
            <div>
              <dt>Signed in until</dt>
              <dd>
                <time dateTime={session.expiresAt}>{formatDateTime(session.expiresAt)}</time>
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="account-panel-plan">
          <h3 id="account-panel-plan">Included with this plan</h3>
          <ul>
            {Object.entries(ENTITLEMENT_LABELS).map(([capability, label]) => (
              <li key={capability}>
                <span>{label}</span>
                <span>
                  {entitlements.capabilities[capability as keyof typeof ENTITLEMENT_LABELS] === true
                    ? 'Included'
                    : 'Not included'}
                </span>
              </li>
            ))}
          </ul>
          <dl>
            <div>
              <dt>Saved Videos limit</dt>
              <dd>{limitLabel(entitlements.limits.maximumSavedVideos)}</dd>
            </div>
            <div>
              <dt>Saved Characters limit</dt>
              <dd>{limitLabel(entitlements.limits.maximumSavedCharacters)}</dd>
            </div>
            <div>
              <dt>Saved Outfits limit</dt>
              <dd>{limitLabel(entitlements.limits.maximumSavedOutfits)}</dd>
            </div>
            <div>
              <dt>Monthly credits</dt>
              <dd>
                {entitlements.limits.monthlyCredits === null
                  ? 'Not metered'
                  : String(entitlements.limits.monthlyCredits)}
              </dd>
            </div>
          </dl>
        </section>

        <section aria-labelledby="account-panel-integrations">
          <h3 id="account-panel-integrations">Configured integrations</h3>
          <ul>
            {capabilityRows.map((row) => (
              <li key={row.id}>
                <span>{row.label}</span>
                <span>{row.state}</span>
              </li>
            ))}
          </ul>
          <small>{capabilityFootnote}</small>
        </section>

        <section aria-labelledby="account-panel-activity">
          <h3 id="account-panel-activity">AI activity</h3>
          <p role="status">
            {activeJobsQuery.isPending
              ? 'Checking for running AI jobs…'
              : activeJobsQuery.isError || activeJobCount === null
                ? 'The number of running AI jobs is unavailable right now.'
                : activeJobCount === 1
                  ? '1 AI job is running right now.'
                  : `${activeJobCount} AI jobs are running right now.`}
          </p>
          <p>
            Each Project keeps its own record of completed AI runs — open a Project and check its
            History. Lightframe does not keep a lifetime total across Projects.
          </p>
        </section>
      </div>
    </OverlayPanel>
  );
};
