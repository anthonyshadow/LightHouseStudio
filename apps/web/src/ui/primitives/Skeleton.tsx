import { keyframes, useTheme, type CSSObject, type Theme } from '@emotion/react';

/**
 * `line` and `poster` are the two atoms — a text line and a media block. `row` and `card` compose
 * them into the two list shapes this product actually repeats, so a surface that shows a list of
 * posters with two lines of copy does not have to redraw that arrangement itself.
 */
type SkeletonVariant = 'line' | 'poster' | 'row' | 'card';

const skeletonPulse = keyframes({
  '0%, 100%': { opacity: 0.48 },
  '50%': { opacity: 0.82 },
});

/**
 * The material every placeholder is made of. Exported for the few placeholders whose *shape* is
 * owned by their surface — the Assets tab count sits inside a pill the tab list draws — so those
 * cannot drift away from the primitive's colour, radius and pulse.
 *
 * The pulse states its own reduced-motion branch. The global reset in `StudioDesignProvider` sets
 * `animation-duration` on `*`, which loses to this rule's class on specificity no matter what
 * order they are inserted in — so a reader who assumes the reset covers it is wrong, and every
 * placeholder in the product would pulse for someone who asked motion to stop.
 */
export const skeletonSurfaceStyles = (theme: Theme): CSSObject => ({
  borderRadius: theme.radii.small,
  background: theme.colors.surfaceStrong,
  animation: `${skeletonPulse} 1.4s ease-in-out infinite`,
  '@media (prefers-reduced-motion: reduce)': { animation: 'none' },
});

const lineStyles = (theme: Theme): CSSObject => ({
  ...skeletonSurfaceStyles(theme),
  display: 'block',
  width: '100%',
  height: '0.8rem',
});

const posterStyles = (theme: Theme): CSSObject => ({
  ...skeletonSurfaceStyles(theme),
  display: 'block',
  width: '100%',
  aspectRatio: '16 / 9',
  borderRadius: theme.radii.medium,
});

/** The copy column shared by `row` and `card`: one full line and one short one. */
const compositeCopyStyles = (theme: Theme): CSSObject => ({
  '& [data-skeleton-lines]': { minWidth: 0, display: 'grid', gap: theme.space.sm },
  '& [data-skeleton-line]': lineStyles(theme),
  '& [data-skeleton-line="short"]': { width: '54%' },
});

const rowStyles = (theme: Theme): CSSObject => ({
  ...compositeCopyStyles(theme),
  minWidth: 0,
  minHeight: '5.5rem',
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  alignItems: 'center',
  gap: theme.space.md,
  paddingBlock: theme.space.md,
  '& [data-skeleton-poster]': { ...posterStyles(theme), width: 'min(5.5rem, 26cqi)' },
});

const cardStyles = (theme: Theme): CSSObject => ({
  ...compositeCopyStyles(theme),
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  overflow: 'hidden',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  '& [data-skeleton-poster]': { ...posterStyles(theme), borderRadius: 0 },
  '& [data-skeleton-lines]': { display: 'grid', gap: theme.space.sm, padding: theme.space.md },
});

const variantStyles = (theme: Theme, variant: SkeletonVariant): CSSObject => {
  if (variant === 'poster') return posterStyles(theme);
  if (variant === 'row') return rowStyles(theme);
  if (variant === 'card') return cardStyles(theme);
  return lineStyles(theme);
};

interface SkeletonProps {
  readonly variant?: SkeletonVariant;
  /** Overrides the atom's width — `line` defaults to full width, which rarely reads as text. */
  readonly width?: string;
  /** Overrides the atom's height, for a line standing in for a heading rather than body copy. */
  readonly height?: string;
}

/**
 * A placeholder that reserves the shape of content still loading. It is presentation only and
 * always hidden from assistive technology: the section around it owns the one polite live region
 * that says a load is in progress, and a screen reader should hear that sentence once rather than
 * a shape per row.
 */
export const Skeleton = ({ variant = 'line', width, height }: SkeletonProps) => {
  const theme = useTheme();
  const composite = variant === 'row' || variant === 'card';
  return (
    <span
      aria-hidden="true"
      data-skeleton={variant}
      css={[variantStyles(theme, variant), { width, height }]}
    >
      {composite ? (
        <>
          <span data-skeleton-poster="" />
          <span data-skeleton-lines="">
            <span data-skeleton-line="" />
            <span data-skeleton-line="short" />
          </span>
        </>
      ) : null}
    </span>
  );
};
