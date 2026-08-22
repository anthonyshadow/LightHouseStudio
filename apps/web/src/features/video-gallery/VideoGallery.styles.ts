import type { CSSObject, Theme } from '@emotion/react';
import { buttonVariantStyles } from '../../ui/primitives/Button';
import { media } from '../../ui/media';

export const galleryStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.lg,
  minWidth: 0,
});

export const gallerySummaryStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.md,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.metadata,
  '& strong': { color: theme.colors.text, fontWeight: 760 },
});

export const gallerySearchRowStyles = (): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  [media.up('laptop')]: { maxWidth: '32rem' },
});

export const filterControlsStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  alignItems: 'end',
  gap: theme.space.sm,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  '& > button': { minHeight: '2.75rem' },
  [media.up('tablet')]: {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
  [media.up('laptop')]: {
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr)) auto',
  },
});

export const gridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: theme.space.lg,
  paddingBlockEnd: theme.space.lg,
  [media.up('tablet')]: {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
  [media.up('laptop')]: {
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  },
  '@media (max-height: 36rem)': { gap: theme.space.md },
});

export const cardStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  boxShadow: theme.shadows.soft,
  transition: `border-color ${theme.motion.standard}, transform ${theme.motion.quick}`,
  '&:hover': { borderColor: theme.colors.borderStrong, transform: 'translateY(-1px)' },
  '&:has(details[open])': { zIndex: 2 },
  '& h3, & p': { margin: 0 },
});

export const posterButtonStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  width: '100%',
  minWidth: 0,
  padding: 0,
  overflow: 'hidden',
  border: 0,
  borderRadius: `${theme.radii.large} ${theme.radii.large} 0 0`,
  color: theme.colors.text,
  background: theme.colors.canvasRaised,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
  '&:hover [data-gallery-thumbnail], &:focus-visible [data-gallery-thumbnail]': {
    transform: 'scale(1.035)',
  },
  '&:hover [data-gallery-play], &:focus-visible [data-gallery-play]': {
    color: theme.colors.onAccent,
    background: theme.colors.accent,
    transform: 'scale(1.04)',
  },
});

export const posterStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  aspectRatio: '16 / 9',
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  color: theme.colors.textMuted,
  background: `linear-gradient(135deg, ${theme.colors.surfaceStrong}, ${theme.colors.canvas})`,
  '&::after': {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, transparent 48%, rgba(2, 5, 9, 0.5))',
    content: '""',
    pointerEvents: 'none',
  },
});

export const thumbnailStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  transition: `transform 600ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity ${theme.motion.standard}`,
});

export const thumbnailPlaceholderStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  placeItems: 'center',
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.caption,
  '& svg': { width: '2rem', height: '2rem' },
});

export const playBadgeStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  zIndex: 1,
  insetBlockStart: '50%',
  insetInlineStart: '50%',
  width: '3.5rem',
  height: '3.5rem',
  display: 'grid',
  placeItems: 'center',
  border: `1px solid color-mix(in srgb, ${theme.colors.text} 28%, transparent)`,
  borderRadius: theme.radii.round,
  color: theme.colors.text,
  background: 'rgba(2, 5, 9, 0.64)',
  boxShadow: theme.shadows.soft,
  transform: 'translate(-50%, -50%)',
  transition: `color ${theme.motion.quick}, background ${theme.motion.quick}, transform ${theme.motion.quick}`,
  backdropFilter: 'blur(8px)',
  '& svg': { width: '1.35rem', height: '1.35rem', marginInlineStart: '0.12rem' },
});

export const durationBadgeStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  zIndex: 1,
  insetInlineEnd: theme.space.sm,
  insetBlockEnd: theme.space.sm,
  padding: '0.25rem 0.45rem',
  borderRadius: theme.radii.small,
  color: theme.colors.text,
  background: 'rgba(2, 5, 9, 0.78)',
  fontFamily: theme.type.mono,
  fontSize: theme.fontSizes.caption,
  lineHeight: 1,
});

export const cardBodyStyles = (theme: Theme): CSSObject => ({
  flex: 1,
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  padding: theme.space.md,
});

export const cardCopyStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.xxs,
  '& h3': {
    color: theme.colors.text,
    fontSize: theme.fontSizes.body,
    fontWeight: 760,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
  },
  '& p': {
    color: theme.colors.textFaint,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.45,
  },
});

export const chipRowStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
});

export const chipStyles = (theme: Theme): CSSObject => ({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '1.5rem',
  padding: '0.15rem 0.5rem',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.round,
  color: theme.colors.textMuted,
  background: theme.colors.surfaceStrong,
  fontSize: theme.fontSizes.caption,
  lineHeight: 1.2,
});

/** The deliberate no-preview state: a plain statement of fact and the action that resolves it. */
export const noPreviewActionStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.xs,
  padding: `${theme.space.xs} ${theme.space.sm}`,
  border: `1px dashed ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.surfaceStrong,
  '& > span': {
    minWidth: 0,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.4,
  },
});

/**
 * The one definition of the library's `<a download>` treatment, shared by the card's lead action
 * and the version-preview footer. `Button` has no anchor form yet, so a download link cannot be a
 * `Button`; when one is added (design-system consolidation) both call sites collapse onto it.
 */
export const downloadLinkStyles = (theme: Theme): CSSObject => ({
  minHeight: '2.85rem',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.7rem 1rem',
  border: '1px solid transparent',
  borderRadius: theme.radii.medium,
  // The primary fill comes from the primitive, so the accent treatment keeps one owner.
  ...buttonVariantStyles(theme, 'primary'),
  fontWeight: 720,
  lineHeight: 1.1,
  textDecoration: 'none',
  '&:hover': { borderColor: theme.colors.accent },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
});

export const actionsStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
  gap: theme.space.xs,
  marginBlockStart: 'auto',
  // Retrieval leads: the download link takes the row, the rest live behind the overflow.
  '& > a:first-of-type': { ...downloadLinkStyles(theme), flex: 1 },
});

export const paginationStyles = (theme: Theme): CSSObject => ({
  position: 'sticky',
  insetBlockEnd: 0,
  display: 'flex',
  justifyContent: 'center',
  padding: `${theme.space.sm} 0 max(${theme.space.sm}, env(safe-area-inset-bottom))`,
  background: `linear-gradient(180deg, transparent, ${theme.colors.overlaySurface} 32%)`,
});

export const previewContentStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.md,
});

export const previewPlayerStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  width: '100%',
  maxHeight: '58dvh',
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: '#000',
  boxShadow: theme.shadows.lifted,
  '& video': {
    width: '100%',
    maxWidth: '100%',
    maxHeight: '58dvh',
    aspectRatio: '16 / 9',
    objectFit: 'contain',
    background: '#000',
  },
  [media.downOrShort('tablet', '36rem')]: {
    maxHeight: '46dvh',
    borderRadius: theme.radii.medium,
    '& video': { maxHeight: '46dvh' },
  },
});

export const previewMetadataStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: `${theme.space.xs} ${theme.space.md}`,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.metadata,
});

export const previewFooterStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: theme.space.xs,
  '& > *': { minWidth: '8.5rem' },
  '& > a': downloadLinkStyles(theme),
  [media.down('tablet')]: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    '& > *': { minWidth: 0 },
  },
  '@media (max-width: 20rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});
