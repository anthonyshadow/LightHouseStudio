import type { CSSObject, Theme } from '@emotion/react';

export const composerStackStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.md,
});

export const composerHeadingStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xxs,
  '& h2': { margin: 0, fontFamily: theme.type.display, fontSize: '1.1rem' },
  '& p': { margin: 0, color: theme.colors.textMuted, fontSize: '0.84rem', lineHeight: 1.5 },
});

export const composerActionsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  '& > button': { flex: '1 1 8rem' },
});

export const referenceFileAreaStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: theme.space.sm,
  alignItems: 'center',
  padding: theme.space.sm,
  border: `1px dashed ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
  '& input': { width: '100%', minHeight: '2.75rem', color: theme.colors.textMuted },
  '& input::file-selector-button': {
    minHeight: '2.75rem',
    marginInlineEnd: theme.space.sm,
    paddingInline: theme.space.sm,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.medium,
    color: theme.colors.text,
    background: theme.colors.canvasRaised,
    font: 'inherit',
    fontWeight: 760,
    cursor: 'pointer',
  },
  '& input:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
  '@media (max-width: 31rem)': { gridTemplateColumns: '1fr' },
});

export const referenceGuidanceStyles = (theme: Theme): CSSObject => ({
  gridColumn: '1 / -1',
  display: 'grid',
  gap: theme.space.xxs,
  '& label': { color: theme.colors.text, fontWeight: 760 },
  '& span': { color: theme.colors.textMuted, fontSize: '0.78rem', lineHeight: 1.5 },
});

export const referencePreviewStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: '5rem 1fr',
  gap: theme.space.sm,
  alignItems: 'center',
  '& img': {
    width: '5rem',
    height: '5rem',
    borderRadius: theme.radii.medium,
    objectFit: 'cover',
    border: `1px solid ${theme.colors.border}`,
  },
  '& p': { margin: 0, color: theme.colors.textMuted, fontSize: '0.8rem' },
});

export const enhancementToggleStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'flex-start',
  gap: theme.space.sm,
  color: theme.colors.textMuted,
  fontSize: '0.86rem',
  lineHeight: 1.45,
  '& input': { marginTop: '0.2rem', accentColor: theme.colors.accent },
  '& strong': { display: 'block', color: theme.colors.text },
});

export const providerDisclosureStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  color: theme.colors.textFaint,
  fontSize: '0.74rem',
  lineHeight: 1.45,
});
