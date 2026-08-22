import type { CSSObject, Theme } from '@emotion/react';
import { media } from '../media';

/**
 * One page frame for every top-level surface.
 *
 * Project overview is the model — it was the only surface that capped its content width — but the
 * frame is deliberately *not* a card: a page is the ground the content sits on, so it carries no
 * border and no radius. Nesting a bordered page inside the shell's own chrome is what made Assets
 * and Campaigns read as boxes inside boxes.
 *
 * Padding is viewport-relative rather than container-relative because this element *is* the query
 * container for everything inside it; `cqi` here would be asking about the width it is deciding.
 */
export const pageShellStyles = (theme: Theme): CSSObject => ({
  width: 'min(100%, 88rem)',
  minWidth: 0,
  minHeight: '100%',
  marginInline: 'auto',
  paddingInline: `clamp(${theme.space.md}, 4vw, ${theme.space.xxl})`,
  paddingBlock: `clamp(${theme.space.xl}, 5vw, 4rem) ${theme.space.xxl}`,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  alignContent: 'start',
  background: theme.colors.canvas,
  containerType: 'inline-size',
  '& > [role="status"]:empty': { display: 'none' },
  [media.downOrShort('tablet', '36rem')]: { paddingInline: theme.space.md },
});

/**
 * One page header. The `h1` scale is Project overview's, generalised: `cqi` against the shell means
 * a title shrinks with the content column rather than with the window, which is what a persistent
 * rail and a fixed page cap require.
 */
export const pageHeaderStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  '& [data-page-identity]': {
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'end',
    gap: theme.space.xl,
    paddingBlockEnd: '2.5rem',
    borderBlockEnd: `1px solid ${theme.colors.border}`,
  },
  '& [data-page-identity] > div:first-of-type': { minWidth: 0, width: '100%' },
  '& [data-page-eyebrow]': {
    display: 'block',
    marginBlockEnd: theme.space.xs,
    color: theme.colors.textMuted,
    fontSize: '0.9375rem',
    fontWeight: 600,
    letterSpacing: '-0.01em',
  },
  '& h1': {
    width: '100%',
    maxWidth: '48rem',
    margin: 0,
    overflowWrap: 'anywhere',
    fontFamily: theme.type.display,
    fontSize: 'clamp(2.25rem, 4cqi, 3rem)',
    fontWeight: 660,
    letterSpacing: '-0.05em',
    lineHeight: 1,
  },
  '& [data-page-description]': {
    maxWidth: '48rem',
    margin: `${theme.space.md} 0 0`,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.label,
    lineHeight: 1.55,
  },
  '& [data-page-actions]': {
    minWidth: 0,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: theme.space.sm,
  },
  '@container (max-width: 64rem)': {
    '& [data-page-identity]': { gridTemplateColumns: 'minmax(0, 1fr)', alignItems: 'stretch' },
    '& [data-page-identity] > div:first-of-type': { maxWidth: 'none' },
    '& h1': { maxWidth: 'none' },
    '& [data-page-actions]': { justifyContent: 'flex-start' },
  },
  '@container (max-width: 30rem)': {
    '& [data-page-identity]': { gap: theme.space.lg, paddingBlockEnd: theme.space.xl },
    '& h1': { fontSize: 'clamp(1.75rem, 11cqi, 2.6rem)' },
    '& [data-page-description]': { fontSize: theme.fontSizes.body },
    // One primary and one overflow: the primary takes the width it needs, the menu stays square.
    '& [data-page-actions]': {
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      columnGap: theme.space.sm,
    },
    '& [data-page-actions] > button:first-of-type': { width: '100%' },
  },
});
