import type { CSSObject, Theme } from '@emotion/react';

export const builderLayoutStyles = (_theme: Theme): CSSObject => ({
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: '16.25rem minmax(0, 1fr)',
  overflow: 'hidden',
  '@media (max-width: 64rem)': {
    gridTemplateColumns: '1fr',
    gridTemplateRows: 'auto minmax(0, 1fr)',
  },
});

export const stepNavigationStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space.xl,
  padding: theme.space.lg,
  overflowY: 'auto',
  borderInlineEnd: `1px solid ${theme.colors.border}`,
  background: theme.colors.canvasRaised,
  '@media (max-width: 64rem)': {
    flexDirection: 'row',
    gap: theme.space.lg,
    padding: theme.space.md,
    overflowX: 'auto',
    overflowY: 'hidden',
    borderInlineEnd: 0,
    borderBlockEnd: `1px solid ${theme.colors.border}`,
  },
  '@media (max-width: 31rem)': {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: theme.space.xs,
    padding: theme.space.sm,
    overflowX: 'hidden',
  },
});

export const stepButtonStyles = (theme: Theme, active: boolean): CSSObject => ({
  minWidth: 0,
  minHeight: '2.75rem',
  display: 'flex',
  alignItems: 'flex-start',
  gap: theme.space.sm,
  padding: `0 ${theme.space.sm} 0 ${theme.space.md}`,
  border: 0,
  borderInlineStart: `2px solid ${active ? theme.colors.accent : 'transparent'}`,
  color: active ? theme.colors.accent : theme.colors.textFaint,
  background: 'transparent',
  textAlign: 'start',
  cursor: 'pointer',
  '&:hover': { color: theme.colors.text },
  '&:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '2px' },
  '& [data-step-number]': {
    flex: '0 0 auto',
    width: '1.5rem',
    height: '1.5rem',
    display: 'grid',
    placeItems: 'center',
    border: '2px solid currentColor',
    borderRadius: theme.radii.round,
    fontSize: '0.7rem',
    fontWeight: 800,
  },
  '& strong, & small': { display: 'block' },
  '& strong': { fontSize: theme.fontSizes.body, whiteSpace: 'nowrap' },
  '& small': {
    marginBlockStart: theme.space.xxs,
    color: active ? theme.colors.textMuted : theme.colors.textFaint,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.3,
  },
  '@media (max-width: 64rem)': {
    flex: '0 0 auto',
    padding: 0,
    borderInlineStart: 0,
    '& small': { display: 'none' },
  },
  '@media (max-width: 31rem)': {
    width: '100%',
    minHeight: '44px',
    justifyContent: 'center',
    gap: theme.space.xs,
    '& strong': {
      fontSize: '0.7rem',
      lineHeight: 1.15,
      whiteSpace: 'normal',
    },
  },
});

export const workflowMainStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  overflowY: 'auto',
  background: theme.colors.canvas,
  scrollbarGutter: 'stable',
});

export const workflowCanvasStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) minmax(20rem, 25rem)',
  alignItems: 'start',
  gap: theme.space.xxl,
  marginInline: 'auto',
  padding: `${theme.space.xxl} ${theme.space.xl}`,
  '@media (max-width: 79.99rem)': {
    gridTemplateColumns: '1fr',
    maxWidth: '52rem',
    padding: theme.space.xl,
  },
  '@media (max-width: 40rem)': {
    padding: theme.space.md,
  },
});

export const stepContentStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.xxl,
  '& > header': {
    display: 'flex',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  '& > header h2': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: theme.fontSizes.section,
    fontWeight: 650,
  },
  '@media (max-width: 40rem)': { gap: theme.space.xl },
});

export const stepEyebrowStyles = (theme: Theme): CSSObject => ({
  flex: '0 0 auto',
  padding: `0.2rem ${theme.space.xs}`,
  borderRadius: theme.radii.small,
  color: theme.colors.accent,
  background: theme.colors.accentSoft,
  fontSize: '0.7rem',
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
});

export const fieldSectionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.md,
  '& > header': {
    minWidth: 0,
    display: 'flex',
    alignItems: 'end',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  '& h3, & p': { margin: 0 },
  '& h3': { fontSize: theme.fontSizes.label },
  '& p': {
    color: theme.colors.textFaint,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.45,
  },
});

export const generationCardStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.lg,
  padding: theme.space.lg,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.canvasRaised,
  '& > header': {
    display: 'flex',
    alignItems: 'center',
    gap: theme.space.md,
  },
  '& h3, & p': { margin: 0 },
  '& h3': { fontSize: theme.fontSizes.label },
  '& p': { marginBlockStart: theme.space.xxs, color: theme.colors.textFaint },
  '& [data-generation-icon]': {
    width: '3rem',
    height: '3rem',
    display: 'grid',
    placeItems: 'center',
    borderRadius: theme.radii.round,
    color: theme.colors.accent,
    background: theme.colors.accentSoft,
    fontSize: '1.4rem',
  },
});

export const sectionStackStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.lg,
});

export const choiceSectionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  paddingBlockEnd: theme.space.lg,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  '&:last-of-type': { borderBlockEnd: 0, paddingBlockEnd: 0 },
  '& h3': { margin: 0, fontSize: theme.fontSizes.label },
  '& p': { margin: 0, color: theme.colors.textMuted, fontSize: theme.fontSizes.metadata },
});

export const directChoiceSectionStyles = (theme: Theme): CSSObject => ({
  ...fieldSectionStyles(theme),
  paddingBlockEnd: 0,
  borderBlockEnd: 0,
  '& [data-current-choice]': {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.caption,
    fontWeight: 800,
  },
});

export const choiceDrawerStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.surfaceSoft,
  overflow: 'clip',
  '&[open]': { borderColor: theme.colors.borderStrong },
  '&[open] summary [data-drawer-chevron]': { transform: 'rotate(180deg)' },
});

export const choiceDrawerSummaryStyles = (theme: Theme): CSSObject => ({
  minHeight: '3.5rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  padding: theme.space.sm,
  color: theme.colors.text,
  cursor: 'pointer',
  listStyle: 'none',
  '&::-webkit-details-marker': { display: 'none' },
  '&:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '-3px' },
  '& [role="heading"]': { display: 'block', fontWeight: 850 },
  '& [data-drawer-description]': {
    display: 'block',
    marginBlockStart: theme.space.xxs,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.4,
    overflowWrap: 'anywhere',
  },
  '& > span:first-of-type': { minWidth: 0 },
  '& [data-drawer-chevron]': {
    flex: '0 0 auto',
    fontSize: '1.25rem',
    transition: 'transform 160ms ease',
  },
  '@media (prefers-reduced-motion: reduce)': {
    '& [data-drawer-chevron]': { transition: 'none' },
  },
});

export const choiceDrawerContentStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  padding: `${theme.space.xs} ${theme.space.sm} ${theme.space.sm}`,
  borderBlockStart: `1px solid ${theme.colors.border}`,
});

export const optionGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(6, minmax(5.25rem, 1fr))',
  gap: theme.space.xs,
  '@media (max-width: 78rem)': { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' },
  '@media (max-width: 32rem)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
});

export const optionCardStyles = (theme: Theme, selected: boolean): CSSObject => ({
  position: 'relative',
  minWidth: 0,
  minHeight: '6.75rem',
  display: 'grid',
  gridTemplateRows: 'minmax(3.5rem, 1fr) auto',
  padding: 0,
  overflow: 'hidden',
  border: `2px solid ${selected ? theme.colors.accent : theme.colors.border}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.text,
  background: selected ? theme.colors.accentSoft : theme.colors.surfaceSoft,
  cursor: 'pointer',
  '&:hover:not(:disabled)': {
    borderColor: selected ? theme.colors.accent : theme.colors.borderStrong,
  },
  '&:disabled': { cursor: 'not-allowed', opacity: 0.52 },
  '&:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '3px' },
  '&[aria-pressed="true"]::after': {
    content: '"✓"',
    position: 'absolute',
    inset: `${theme.space.xxs} ${theme.space.xxs} auto auto`,
    width: '1.4rem',
    height: '1.4rem',
    display: 'grid',
    placeItems: 'center',
    borderRadius: theme.radii.round,
    color: theme.colors.onAccent,
    background: theme.colors.accent,
    fontWeight: 900,
  },
});

export const optionVisualStyles = (theme: Theme, fullLength = false): CSSObject => ({
  width: '100%',
  minHeight: fullLength ? '8rem' : '5rem',
  aspectRatio: fullLength ? '3 / 4' : '4 / 3',
  backgroundColor: theme.colors.surfaceStrong,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'center',
  backgroundSize: 'contain',
});

export const optionLabelStyles = (theme: Theme): CSSObject => ({
  minHeight: '2.75rem',
  display: 'grid',
  placeItems: 'center',
  padding: theme.space.xs,
  fontSize: theme.fontSizes.caption,
  fontWeight: 800,
  lineHeight: 1.2,
  textAlign: 'center',
});

export const choiceActionsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  '& button': { minHeight: '2.75rem' },
});

export const currentChoiceStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  padding: theme.space.sm,
  border: `1px dashed ${theme.colors.warning}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.textMuted,
  background: theme.colors.warningSoft,
  '& strong': { color: theme.colors.text },
  '& > span:first-of-type': { minWidth: 0, overflowWrap: 'anywhere' },
});

export const customFieldStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  '& label': { color: theme.colors.text, fontWeight: 750 },
  '& input, & textarea, & select': {
    width: '100%',
    minHeight: '2.75rem',
    padding: theme.space.sm,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.medium,
    color: theme.colors.text,
    background: theme.colors.canvasRaised,
  },
  '& textarea': { minHeight: '6rem', resize: 'vertical' },
  '& input:focus-visible, & textarea:focus-visible, & select:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
});

export const previewPanelStyles = (theme: Theme): CSSObject => ({
  position: 'sticky',
  top: theme.space.md,
  minWidth: 0,
  display: 'grid',
  gap: theme.space.md,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.canvasRaised,
  '& h3': { margin: 0 },
  '@media (max-width: 64rem)': { position: 'static' },
});

export const heroPreviewStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  width: '100%',
  aspectRatio: '3 / 4',
  overflow: 'hidden',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.gradients.stageIdle,
  backgroundRepeat: 'no-repeat',
  '& img': { width: '100%', height: '100%', objectFit: 'contain' },
});

export const previewLabelStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  inset: 'auto 0 0',
  padding: theme.space.sm,
  color: theme.colors.text,
  background: 'linear-gradient(180deg, transparent, rgba(2, 6, 10, 0.92))',
  fontSize: theme.fontSizes.caption,
  fontWeight: 800,
});

export const thumbnailStripStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  gap: theme.space.xs,
  '& div': {
    minWidth: 0,
    minHeight: '4rem',
    display: 'grid',
    alignContent: 'end',
    padding: theme.space.xs,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.small,
    color: theme.colors.text,
    background: theme.colors.surfaceStrong,
    backgroundPosition: 'center',
    backgroundSize: 'contain',
    backgroundRepeat: 'no-repeat',
    fontSize: '0.65rem',
    fontWeight: 800,
    textShadow: '0 1px 4px #000',
  },
});

export const summaryChipStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  margin: 0,
  padding: 0,
  listStyle: 'none',
  '& li': {
    padding: `0.3rem ${theme.space.sm}`,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.round,
    color: theme.colors.textMuted,
    background: theme.colors.surfaceSoft,
    fontSize: theme.fontSizes.caption,
  },
});
