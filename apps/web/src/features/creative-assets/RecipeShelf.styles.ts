import type { CSSObject, Theme } from '@emotion/react';

export const shelfStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: `clamp(${theme.space.md}, 2.5vw, ${theme.space.lg})`,
});

export const shelfHeaderStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: theme.space.md,
  '@media (max-width: 38rem)': {
    display: 'grid',
  },
});

export const eyebrowStyles = (theme: Theme): CSSObject => ({
  marginBlockEnd: theme.space.xs,
  color: theme.colors.signal,
  fontSize: '0.72rem',
  fontWeight: 820,
  letterSpacing: '0.13em',
  textTransform: 'uppercase',
});

export const titleStyles = (theme: Theme): CSSObject => ({
  marginBlockEnd: theme.space.xs,
  fontFamily: theme.type.display,
  fontSize: 'clamp(1.25rem, 3vw, 1.75rem)',
  letterSpacing: '-0.025em',
});

export const introStyles = (theme: Theme): CSSObject => ({
  maxWidth: '58ch',
  margin: 0,
  color: theme.colors.textMuted,
  lineHeight: 1.55,
});

export const toolbarStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(12rem, 1fr) minmax(10rem, auto)',
  alignItems: 'end',
  gap: theme.space.sm,
  '@media (max-width: 40rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
});

export const categoryStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
});

export const categoryButtonStyles = (theme: Theme, selected: boolean): CSSObject => ({
  minHeight: '2.75rem',
  padding: `${theme.space.xs} ${theme.space.sm}`,
  border: `1px solid ${selected ? theme.colors.signal : theme.colors.border}`,
  borderRadius: theme.radii.round,
  color: selected ? '#1d1303' : theme.colors.textMuted,
  background: selected ? theme.colors.signal : theme.colors.canvasRaised,
  fontSize: '0.8rem',
  fontWeight: 760,
  cursor: 'pointer',
  '&:hover': { borderColor: theme.colors.signal, color: selected ? '#1d1303' : theme.colors.text },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
});

export const countStyles = (theme: Theme): CSSObject => ({
  opacity: 0.7,
  fontFamily: theme.type.mono,
  fontSize: '0.7rem',
});

export const listStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  padding: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 18rem), 1fr))',
  gap: theme.space.sm,
  listStyle: 'none',
});

export const cardStyles = (theme: Theme): CSSObject => ({
  height: '100%',
  padding: theme.space.md,
  display: 'grid',
  gridTemplateRows: 'auto auto 1fr auto',
  gap: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
  transition: `border-color ${theme.motion.quick}, transform ${theme.motion.quick}`,
  '&:hover': {
    borderColor: theme.colors.borderStrong,
    transform: 'translateY(-1px)',
  },
});

export const cardHeaderStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: theme.space.sm,
});

export const cardTitleStyles = (): CSSObject => ({
  margin: 0,
  fontSize: '0.98rem',
  lineHeight: 1.35,
  overflowWrap: 'anywhere',
});

export const metadataStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.space.xs,
  color: theme.colors.textFaint,
  fontSize: '0.72rem',
});

export const badgeStyles = (
  theme: Theme,
  tone: 'accent' | 'signal' | 'neutral' = 'neutral',
): CSSObject => ({
  padding: '0.2rem 0.45rem',
  borderRadius: theme.radii.round,
  color:
    tone === 'accent'
      ? theme.colors.accentStrong
      : tone === 'signal'
        ? theme.colors.signal
        : theme.colors.textMuted,
  background:
    tone === 'accent'
      ? theme.colors.accentSoft
      : tone === 'signal'
        ? theme.colors.signalSoft
        : theme.colors.surfaceStrong,
  fontSize: '0.67rem',
  fontWeight: 760,
  letterSpacing: '0.025em',
});

export const promptStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  display: '-webkit-box',
  overflow: 'hidden',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 5,
  color: theme.colors.textMuted,
  fontSize: '0.84rem',
  lineHeight: 1.55,
  overflowWrap: 'anywhere',
});

export const notesStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  color: theme.colors.textFaint,
  fontSize: '0.75rem',
  lineHeight: 1.45,
});

export const tagsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xxs,
});

export const tagStyles = (theme: Theme): CSSObject => ({
  padding: '0.18rem 0.42rem',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.round,
  color: theme.colors.textFaint,
  fontSize: '0.66rem',
});

export const actionStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.space.xs,
  paddingBlockStart: theme.space.xxs,
});

export const emptyStyles = (theme: Theme): CSSObject => ({
  padding: `clamp(${theme.space.lg}, 5vw, ${theme.space.xxl})`,
  border: `1px dashed ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  textAlign: 'center',
  color: theme.colors.textMuted,
  background: theme.colors.canvasRaised,
});

export const emptyTitleStyles = (theme: Theme): CSSObject => ({
  marginBlockEnd: theme.space.xs,
  color: theme.colors.text,
  fontSize: '1rem',
});

export const emptyBodyStyles = (): CSSObject => ({
  maxWidth: '46ch',
  margin: '0 auto',
  lineHeight: 1.5,
});

export const formPanelStyles = (theme: Theme): CSSObject => ({
  padding: theme.space.md,
  display: 'grid',
  gap: theme.space.md,
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.surfaceSoft,
});

export const formGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: theme.space.md,
  '@media (max-width: 42rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});

export const formFullWidthStyles = (): CSSObject => ({ gridColumn: '1 / -1' });

export const formTitleStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  color: theme.colors.text,
  fontSize: '1rem',
});

export const dialogStyles = (theme: Theme): CSSObject => ({
  padding: theme.space.md,
  display: 'grid',
  gap: theme.space.sm,
  border: `1px solid ${theme.colors.danger}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.dangerSoft,
});

export const dialogTextStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  color: theme.colors.textMuted,
  lineHeight: 1.5,
});
