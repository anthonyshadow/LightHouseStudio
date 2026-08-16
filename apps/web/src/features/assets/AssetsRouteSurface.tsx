import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { Button } from '../../ui';

type AssetDestination = 'videos' | 'characters' | 'outfits' | 'voices';

type AssetsRouteSurfaceProps = Readonly<{
  characterCount: number;
  outfitCount: number;
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
  '& button': { justifySelf: 'start' },
});

const assetCards: ReadonlyArray<{
  destination: AssetDestination;
  title: string;
  description: string;
}> = [
  {
    destination: 'videos',
    title: 'Videos',
    description: 'Preview, edit, download, rename, remove, and inspect immutable Versions.',
  },
  {
    destination: 'characters',
    title: 'Characters',
    description: 'Manage reusable characters, copies, and Wardrobe variants.',
  },
  {
    destination: 'outfits',
    title: 'Outfits',
    description: 'Reuse saved Virtual Try-On outfits in new or existing video work.',
  },
  {
    destination: 'voices',
    title: 'Voices',
    description: 'Preview the catalog, keep the voices you want, and send one to Studio.',
  },
];

export const AssetsRouteSurface = ({
  characterCount,
  outfitCount,
  onOpen,
  onUploadVideo,
}: AssetsRouteSurfaceProps) => {
  const theme = useTheme();
  const countFor = (destination: AssetDestination): string | null => {
    if (destination === 'characters') return `${characterCount} saved`;
    if (destination === 'outfits') return `${outfitCount} saved`;
    return null;
  };

  return (
    <section css={surfaceStyles(theme)} aria-labelledby="assets-heading">
      <header css={headerStyles(theme)}>
        <div>
          <h1 id="assets-heading" tabIndex={-1}>
            Assets
          </h1>
          <p>
            Find retained videos and reusable creative resources. Saving to Assets never silently
            adds content to a Project or Campaign.
          </p>
        </div>
        <Button variant="primary" onClick={onUploadVideo}>
          Upload video
        </Button>
      </header>

      <div css={gridStyles(theme)}>
        {assetCards.map((card) => {
          const count = countFor(card.destination);
          return (
            <article key={card.destination} css={cardStyles(theme)}>
              <div>
                {count ? <span data-asset-meta>{count}</span> : null}
                <h2>{card.title}</h2>
              </div>
              <p>{card.description}</p>
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
