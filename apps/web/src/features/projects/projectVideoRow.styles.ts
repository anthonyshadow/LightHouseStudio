import type { CSSObject, Theme } from '@emotion/react';
import { durationBadgeStyles as galleryDurationBadgeStyles } from '../video-gallery/VideoGallery.styles';

/**
 * The treatment every list of a Project's videos shares: a poster with its duration, an inline
 * player that opens under the row, and the list they sit in.
 *
 * The Videos gallery owns the badge itself; only the density changes on these smaller tiles, so the
 * poster surfaces cannot drift apart on colour, radius or type. Two surfaces read this — the source
 * pickers and the workspace's Media area — and a third private copy is exactly the drift that
 * deriving from the gallery was written against.
 */
export const videoRowBadgeStyles = (theme: Theme): CSSObject => ({
  ...galleryDurationBadgeStyles(theme),
  insetBlockEnd: theme.space.xxs,
  insetInlineEnd: theme.space.xxs,
  padding: '0.15rem 0.35rem',
});

export const videoRowPreviewStyles = (theme: Theme): CSSObject => ({
  marginBlockStart: theme.space.xs,
  width: '100%',
  maxWidth: '100%',
  height: 'clamp(11rem, 32vh, 18rem)',
});

export const videoRowListStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
  margin: 0,
  padding: 0,
  listStyle: 'none',
});
