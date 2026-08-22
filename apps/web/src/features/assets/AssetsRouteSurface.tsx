import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useQuery } from '@tanstack/react-query';
import { listSavedVideos } from '../../adapters/api-client/savedVideosApi';
import { fetchSavedVoiceCount } from '../../adapters/api-client/voicesApi';
import { type AssetDestination } from '../../app/paths';
import { ASSET_LIBRARY_DESCRIPTIONS } from './assetLibraryDescriptions';
import { creativeLibraryStorageSummary } from '../creative-assets/creativeLibraryStorage';
import type { CreativeLibraryMirror } from '../creative-assets/useCreativeLibraryCloudSync';
import { savedVideoQueryKeys } from '../saved-videos/savedVideoQueryKeys';
import { Button, VisuallyHidden } from '../../ui';

/**
 * What a card knows about its own size.
 *
 * Three states rather than a number, because "none saved" and "not read yet" are different answers
 * and a hub that renders `0` for the second one is lying about an empty library.
 */
export type AssetCountState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly count: number }
  | { readonly status: 'error'; readonly retry: () => void };

type AssetsRouteSurfaceProps = Readonly<{
  /** The browser-held libraries are the shell's, so their counts arrive already resolved. */
  characters: AssetCountState;
  outfits: AssetCountState;
  /** Where the browser-held Character and Outfit libraries actually live in this configuration. */
  creativeLibraryMirror: CreativeLibraryMirror;
  onOpen: (destination: AssetDestination) => void;
  onUploadVideo: () => void;
}>;

const surfaceStyles = (theme: Theme): CSSObject => ({
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  overflowY: 'auto',
  scrollbarGutter: 'stable',
  padding: `clamp(${theme.space.md}, 2.5vw, ${theme.space.xl})`,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.canvasRaised,
  '& h1, & h2': { fontFamily: theme.type.display },
  '& h1': {
    margin: 0,
    fontSize: 'clamp(1.75rem, 4vw, 3rem)',
    letterSpacing: '-0.045em',
  },
  '& p': { margin: 0 },
});

const headerStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'end',
  gap: theme.space.lg,
  paddingBlockEnd: theme.space.xl,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  '& p': {
    maxWidth: '48rem',
    marginBlockStart: theme.space.sm,
    color: theme.colors.textMuted,
    lineHeight: 1.55,
  },
  '@media (max-width: 42rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    '& button': { justifySelf: 'start' },
  },
});

const gridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: theme.space.md,
  marginBlockStart: theme.space.lg,
  '@media (max-width: 64rem)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
  '@media (max-width: 38rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});

const cardStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: '13rem',
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  gap: theme.space.sm,
  padding: theme.space.lg,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  '& h2': { margin: 0, fontSize: '1.15rem' },
  '& p': { color: theme.colors.textMuted, lineHeight: 1.5 },
  '& [data-asset-meta]': {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.caption,
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  '& [data-asset-count-pending]': { color: theme.colors.textFaint },
  /*
   * The same footprint the resolved count occupies, so a card does not resize under the heading
   * when its number arrives.
   */
  '& [data-asset-count-skeleton]': {
    display: 'inline-block',
    width: '4.5rem',
    height: '0.75em',
    borderRadius: theme.radii.small,
    background: theme.colors.border,
    verticalAlign: 'middle',
  },
  '& [data-asset-count-retry]': {
    minHeight: '2.75rem',
    paddingInline: 0,
    fontSize: theme.fontSizes.caption,
  },
  '& [data-asset-storage]': {
    marginBlockStart: theme.space.xs,
    fontSize: theme.fontSizes.metadata,
  },
  '& button': { justifySelf: 'start' },
});

const assetCards: ReadonlyArray<{
  destination: AssetDestination;
  title: string;
  /** The word after the number. Kept per card so "3 saved" never becomes "3 videos saved". */
  noun: string;
}> = [
  { destination: 'videos', title: 'Videos', noun: 'saved' },
  { destination: 'characters', title: 'Characters', noun: 'saved' },
  { destination: 'outfits', title: 'Outfits', noun: 'saved' },
  { destination: 'voices', title: 'Voices', noun: 'kept' },
];

const AssetCount = ({
  state,
  title,
  noun,
}: {
  readonly state: AssetCountState;
  readonly title: string;
  readonly noun: string;
}) => {
  if (state.status === 'loading') {
    return (
      <span data-asset-meta data-asset-count-pending="">
        <span aria-hidden="true" data-asset-count-skeleton="" />
        <VisuallyHidden>Counting {title}…</VisuallyHidden>
      </span>
    );
  }
  if (state.status === 'error') {
    return (
      <span data-asset-meta data-asset-count-pending="">
        <span>Count unavailable</span>{' '}
        <Button
          size="small"
          variant="quiet"
          data-asset-count-retry=""
          aria-label={`Retry counting ${title}`}
          onClick={state.retry}
        >
          Retry
        </Button>
      </span>
    );
  }
  return (
    <span data-asset-meta>
      {state.count} {noun}
    </span>
  );
};

export const AssetsRouteSurface = ({
  characters,
  outfits,
  creativeLibraryMirror,
  onOpen,
  onUploadVideo,
}: AssetsRouteSurfaceProps) => {
  const theme = useTheme();
  /*
   * One page of one, for the total beside it — the hub wants a number, not a library.
   *
   * Deliberately outside `savedVideoQueryKeys.lists`: the Videos library rewrites every query under
   * that key as paged data, and a plain page cached there would be reshaped into a crash. The hub
   * unmounts when the operator leaves it, so the next visit reads the count again.
   */
  const videosQuery = useQuery({
    queryKey: savedVideoQueryKeys.total,
    queryFn: ({ signal }) => listSavedVideos({ pageSize: 1, signal }),
  });
  const voicesQuery = useQuery({
    queryKey: ['voices', 'saved-count'],
    queryFn: ({ signal }) => fetchSavedVoiceCount(signal),
  });

  const countFor = (destination: AssetDestination): AssetCountState => {
    if (destination === 'characters') return characters;
    if (destination === 'outfits') return outfits;
    const query = destination === 'videos' ? videosQuery : voicesQuery;
    if (query.isError) return { status: 'error', retry: () => void query.refetch() };
    if (destination === 'videos') {
      return videosQuery.data === undefined
        ? { status: 'loading' }
        : { status: 'ready', count: videosQuery.data.total };
    }
    return voicesQuery.data === undefined
      ? { status: 'loading' }
      : { status: 'ready', count: voicesQuery.data.count };
  };

  return (
    <section css={surfaceStyles(theme)} aria-labelledby="assets-heading">
      <header css={headerStyles(theme)}>
        <div>
          <h1 id="assets-heading" tabIndex={-1}>
            Assets
          </h1>
          <p>
            Your videos and the creative pieces you reuse. Saving here never adds anything to a
            Project or Campaign on its own.
          </p>
        </div>
        <Button variant="primary" onClick={onUploadVideo}>
          Upload video
        </Button>
      </header>

      <div css={gridStyles(theme)}>
        {assetCards.map((card) => {
          const storage = creativeLibraryStorageSummary(card.destination, creativeLibraryMirror);
          return (
            <article key={card.destination} css={cardStyles(theme)}>
              <div>
                <AssetCount
                  state={countFor(card.destination)}
                  title={card.title}
                  noun={card.noun}
                />
                <h2>{card.title}</h2>
              </div>
              <div>
                <p>{ASSET_LIBRARY_DESCRIPTIONS[card.destination]}</p>
                {storage ? <p data-asset-storage>{storage}</p> : null}
              </div>
              <Button variant="secondary" onClick={() => onOpen(card.destination)}>
                Open {card.title}
              </Button>
            </article>
          );
        })}
      </div>
    </section>
  );
};
