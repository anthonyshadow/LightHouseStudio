import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { ReactNode } from 'react';
import { rotatingSpinnerAnimationStyles } from '../animationStyles';

export type BlockingOverlayTone = 'heavy' | 'soft';

export const blockingOverlayStyles = (theme: Theme, tone: BlockingOverlayTone): CSSObject => ({
  position: 'absolute',
  zIndex: theme.layers.stageBlocking,
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  padding: theme.space.lg,
  color: theme.colors.text,
  background:
    tone === 'heavy'
      ? 'linear-gradient(180deg, rgba(5, 9, 14, 0.42), rgba(5, 9, 14, 0.72))'
      : 'linear-gradient(180deg, rgba(5, 9, 14, 0.2), rgba(5, 9, 14, 0.58))',
  backdropFilter: 'blur(2px)',
  pointerEvents: 'auto',
});

const blockingCardStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  justifyItems: 'center',
  width: 'min(25rem, calc(100% - 2rem))',
  gap: theme.space.xs,
  padding: `${theme.space.md} ${theme.space.lg}`,
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.large,
  color: theme.colors.textMuted,
  background: theme.colors.overlaySurface,
  boxShadow: theme.shadows.lifted,
  textAlign: 'center',
  '& strong': {
    color: theme.colors.text,
    fontFamily: theme.type.display,
    fontSize: theme.fontSizes.label,
  },
  '& span': { fontSize: theme.fontSizes.metadata, lineHeight: 1.45 },
});

/** A ring that turns, or — when motion is unwelcome — a ring that simply reads as active. */
const activityIndicatorStyles = (theme: Theme): CSSObject => ({
  width: '1.45rem',
  height: '1.45rem',
  border: `2px solid ${theme.colors.borderStrong}`,
  borderBlockStartColor: theme.colors.accent,
  borderRadius: '50%',
  ...rotatingSpinnerAnimationStyles('780ms', { borderColor: theme.colors.accent }),
});

export interface BlockingOverlayProps {
  readonly title: string;
  readonly detail: string;
  readonly tone?: BlockingOverlayTone;
  /**
   * Decorative only: the overlay reports progress but does not swallow input. Use it where the
   * work is genuinely interruptible from elsewhere.
   */
  readonly passthrough?: boolean;
  /** An action the operator may still take — a cancel, typically. */
  readonly children?: ReactNode;
}

/**
 * Work in progress, stated over the surface it owns.
 *
 * One implementation for both the media stage and a whole workspace, because they are the same
 * treatment at two sizes: a scrim, a card, a turning ring, and a polite live region so the state
 * is announced rather than merely drawn. It fills the nearest positioned ancestor; where it sits
 * and how high it paints belong to whoever knows the layout.
 */
export const BlockingOverlay = ({
  title,
  detail,
  tone = 'soft',
  passthrough = false,
  children,
}: BlockingOverlayProps) => {
  const theme = useTheme();
  return (
    <div
      css={[blockingOverlayStyles(theme, tone), passthrough && { pointerEvents: 'none' }]}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span css={blockingCardStyles(theme)}>
        <span css={activityIndicatorStyles(theme)} aria-hidden="true" />
        <strong>{title}</strong>
        <span>{detail}</span>
        {children}
      </span>
    </div>
  );
};
