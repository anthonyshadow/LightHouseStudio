import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useQuery } from '@tanstack/react-query';
import { listSavedVideos } from '../../adapters/api-client/savedVideosApi';
import { fetchSavedVoiceCount } from '../../adapters/api-client/voicesApi';
import { type AssetDestination } from '../../app/paths';
import { media } from '../../ui/media';
import { VisuallyHidden } from '../../ui';
import { skeletonSurfaceStyles } from '../../ui/primitives/Skeleton';
import { savedVideoQueryKeys } from '../saved-videos/savedVideoQueryKeys';
import { savedVoiceCountQueryKey } from '../../orchestration/voice-library/useVoiceLibrary';

/** A tab never mistakes an unread library for an empty one. */
export type AssetCountState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly count: number }
  | { readonly status: 'error'; readonly retry: () => void };

interface AssetLibraryTabsProps {
  readonly active: AssetDestination;
  readonly characters: AssetCountState;
  readonly outfits: AssetCountState;
  /** Replaces the current library route so Close still consumes the entry that opened Assets. */
  readonly onSelect: (destination: AssetDestination) => void;
}

const libraryTabs: ReadonlyArray<{
  destination: AssetDestination;
  label: string;
  noun: string;
}> = [
  { destination: 'videos', label: 'Videos', noun: 'saved' },
  { destination: 'characters', label: 'Characters', noun: 'saved' },
  { destination: 'outfits', label: 'Outfits', noun: 'saved' },
  { destination: 'voices', label: 'Voices', noun: 'kept' },
];

const tabListStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: theme.space.xxs,
  padding: theme.space.xxs,
  overflowX: 'auto',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
  scrollbarWidth: 'thin',
  '& button': {
    minWidth: 0,
    minHeight: '2.75rem',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, auto) auto',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.space.xs,
    padding: `${theme.space.xs} ${theme.space.sm}`,
    border: 0,
    borderRadius: theme.radii.small,
    color: theme.colors.textMuted,
    background: 'transparent',
    font: 'inherit',
    fontSize: theme.fontSizes.caption,
    fontWeight: 760,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
  },
  '& button:hover': { color: theme.colors.text, background: theme.colors.surfaceStrong },
  '& button:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '-2px',
  },
  '& button[aria-current="page"]': {
    color: theme.colors.onAccent,
    background: theme.colors.accent,
  },
  '& [data-asset-tab-count]': {
    minWidth: '1.55rem',
    minHeight: '1.55rem',
    display: 'grid',
    placeItems: 'center',
    paddingInline: theme.space.xxs,
    borderRadius: theme.radii.round,
    color: theme.colors.text,
    background: theme.colors.surfaceStrong,
    fontSize: '0.68rem',
    lineHeight: 1,
  },
  '& button[aria-current="page"] [data-asset-tab-count]': {
    color: theme.colors.accentStrong,
    background: theme.colors.canvas,
  },
  /* The pill's shape is this tab list's; only the placeholder material comes from `Skeleton`. */
  '& [data-asset-tab-count="loading"]': {
    ...skeletonSurfaceStyles(theme),
    borderRadius: theme.radii.round,
    color: 'transparent',
  },
  [media.down('tablet')]: {
    display: 'flex',
    '& button': { flex: '0 0 auto', minWidth: '7.4rem' },
  },
});

const Count = ({ state, label, noun }: { state: AssetCountState; label: string; noun: string }) => {
  if (state.status === 'loading') {
    return (
      <span data-asset-tab-count="loading" aria-hidden="true">
        0
      </span>
    );
  }
  if (state.status === 'error') {
    return (
      <span data-asset-tab-count="error">
        <span aria-hidden="true">—</span>
        <VisuallyHidden>{label} count unavailable</VisuallyHidden>
      </span>
    );
  }
  return (
    <span data-asset-tab-count="ready">
      <span aria-hidden="true">{state.count}</span>
      <VisuallyHidden>
        {state.count} {noun}
      </VisuallyHidden>
    </span>
  );
};

export const AssetLibraryTabs = ({
  active,
  characters,
  outfits,
  onSelect,
}: AssetLibraryTabsProps) => {
  const theme = useTheme();
  const videosQuery = useQuery({
    queryKey: savedVideoQueryKeys.total,
    queryFn: ({ signal }) => listSavedVideos({ pageSize: 1, signal }),
  });
  const voicesQuery = useQuery({
    queryKey: savedVoiceCountQueryKey,
    queryFn: ({ signal }) => fetchSavedVoiceCount(signal),
  });

  const countFor = (destination: AssetDestination): AssetCountState => {
    if (destination === 'characters') return characters;
    if (destination === 'outfits') return outfits;
    if (destination === 'videos') {
      if (videosQuery.isError) return { status: 'error', retry: () => void videosQuery.refetch() };
      return videosQuery.data === undefined
        ? { status: 'loading' }
        : { status: 'ready', count: videosQuery.data.total };
    }
    if (voicesQuery.isError) return { status: 'error', retry: () => void voicesQuery.refetch() };
    return voicesQuery.data === undefined
      ? { status: 'loading' }
      : { status: 'ready', count: voicesQuery.data.count };
  };

  return (
    <nav aria-label="Asset libraries" css={tabListStyles(theme)}>
      {libraryTabs.map((tab) => {
        const count = countFor(tab.destination);
        const selected = active === tab.destination;
        return (
          <button
            key={tab.destination}
            type="button"
            aria-current={selected ? 'page' : undefined}
            onClick={() => {
              if (selected && count.status === 'error') count.retry();
              else if (!selected) onSelect(tab.destination);
            }}
          >
            <span>{tab.label}</span>
            <Count state={count} label={tab.label} noun={tab.noun} />
          </button>
        );
      })}
    </nav>
  );
};
