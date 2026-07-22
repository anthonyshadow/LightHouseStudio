import type { CSSObject, Theme } from '@emotion/react';

// Shared character-form styling; route-only consumers were removed with Guided.

export const guidedPageStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  overflow: 'auto',
  color: theme.colors.text,
  background: theme.gradients.shellAmbient,
  scrollbarGutter: 'stable',
});

export const guidedShellStyles = (theme: Theme): CSSObject => ({
  width: 'min(100%, 96rem)',
  minHeight: '100%',
  marginInline: 'auto',
  padding: `${theme.space.lg} clamp(1rem, 3vw, 2.75rem) ${theme.space.xxl}`,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.lg,
  '@media (max-width: 40rem)': {
    padding: `${theme.space.md} ${theme.space.sm} ${theme.space.xl}`,
  },
});

export const guidedHeaderStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.md,
  padding: `${theme.space.sm} 0 ${theme.space.xs}`,
});

export const guidedTopLineStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.md,
  '& h1': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: 'clamp(1.4rem, 3vw, 2.35rem)',
    letterSpacing: '-0.035em',
  },
  '& h1 span': { color: theme.colors.accent },
  '@media (max-width: 40rem)': {
    alignItems: 'stretch',
    flexDirection: 'column',
    '& [data-guided-nav]': { display: 'grid', gridTemplateColumns: '1fr 1fr' },
    '& [data-guided-nav] > a': { width: '100%', minWidth: 0, paddingInline: theme.space.xs },
  },
});

export const quietNavStyles = (theme: Theme): CSSObject => ({
  minHeight: '2.75rem',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  paddingInline: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.round,
  color: theme.colors.textMuted,
  background: theme.colors.surfaceSoft,
  fontWeight: 700,
  textDecoration: 'none',
  whiteSpace: 'nowrap',
  '&:hover': { color: theme.colors.text, borderColor: theme.colors.borderStrong },
  '&:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '3px' },
});

export const progressListStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  gap: theme.space.xs,
  margin: 0,
  padding: 0,
  listStyle: 'none',
  '@media (max-width: 48rem)': {
    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
    gap: theme.space.xxs,
  },
});

export const progressStepStyles = (
  theme: Theme,
  state: 'complete' | 'current' | 'future',
): CSSObject => ({
  minWidth: 0,
  minHeight: '4.5rem',
  display: 'grid',
  gridTemplateColumns: '2rem minmax(0, 1fr)',
  alignItems: 'center',
  gap: theme.space.xs,
  padding: theme.space.sm,
  border: `1px solid ${
    state === 'current'
      ? theme.colors.accent
      : state === 'complete'
        ? theme.colors.borderStrong
        : theme.colors.border
  }`,
  borderRadius: theme.radii.medium,
  color: state === 'future' ? theme.colors.textFaint : theme.colors.text,
  background:
    state === 'current'
      ? `linear-gradient(135deg, ${theme.colors.accentSoft}, ${theme.colors.surface})`
      : theme.colors.surfaceSoft,
  boxShadow: state === 'current' ? theme.shadows.soft : 'none',
  scrollSnapAlign: 'start',
  '& strong': { display: 'block', fontSize: theme.fontSizes.metadata },
  '& span:last-of-type': {
    display: 'block',
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
  },
  '@media (max-width: 48rem)': {
    minHeight: '4.25rem',
    gridTemplateColumns: '1fr',
    placeItems: 'center',
    gap: theme.space.xxs,
    padding: theme.space.xxs,
    textAlign: 'center',
    '& strong': {
      fontSize: 'clamp(.58rem, 2.2vw, .72rem)',
      lineHeight: 1.1,
      overflowWrap: 'anywhere',
    },
    '& span:last-of-type span': { display: 'none' },
  },
});

export const stepNumberStyles = (theme: Theme, active: boolean): CSSObject => ({
  width: '2rem',
  height: '2rem',
  display: 'grid',
  placeItems: 'center',
  borderRadius: theme.radii.round,
  color: active ? theme.colors.onAccent : theme.colors.textMuted,
  background: active ? theme.colors.accent : theme.colors.surfaceStrong,
  fontWeight: 900,
});

export const contentCardStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.lg,
  padding: 'clamp(1rem, 2.3vw, 2rem)',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: `linear-gradient(155deg, rgba(17, 25, 34, 0.98), rgba(9, 16, 23, 0.98))`,
  boxShadow: theme.shadows.lifted,
});

export const stageHeaderStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: theme.space.lg,
  '& h2': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: 'clamp(1.45rem, 3vw, 2.1rem)',
    letterSpacing: '-0.025em',
  },
  '& p': { margin: `${theme.space.xxs} 0 0`, color: theme.colors.textMuted, lineHeight: 1.5 },
  '@media (max-width: 40rem)': { display: 'grid', gap: theme.space.sm },
});

export const savedBadgeStyles = (theme: Theme): CSSObject => ({
  minHeight: '2.25rem',
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.space.xs,
  paddingInline: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.round,
  color: theme.colors.textMuted,
  background: theme.colors.canvasRaised,
  fontSize: theme.fontSizes.caption,
  whiteSpace: 'nowrap',
});

export const builderLayoutStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.55fr) minmax(17rem, 0.65fr)',
  alignItems: 'start',
  gap: theme.space.lg,
  '@media (max-width: 64rem)': { gridTemplateColumns: '1fr' },
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

export const starterGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: theme.space.sm,
  '@media (max-width: 50rem)': { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
  '@media (max-width: 28rem)': { gridTemplateColumns: '1fr' },
});

export const starterCardStyles = (theme: Theme, selected: boolean): CSSObject => ({
  position: 'relative',
  minWidth: 0,
  minHeight: '9.5rem',
  display: 'grid',
  alignContent: 'end',
  padding: 0,
  overflow: 'hidden',
  border: `2px solid ${selected ? theme.colors.accent : theme.colors.border}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.text,
  background: theme.colors.surfaceStrong,
  textAlign: 'left',
  cursor: 'pointer',
  '&:disabled': { cursor: 'not-allowed', opacity: 0.52 },
  boxShadow: selected ? theme.shadows.focus : 'none',
  '&:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '3px' },
  '&[aria-pressed="true"]::after': {
    content: '"✓ Selected"',
    position: 'absolute',
    inset: `${theme.space.xs} ${theme.space.xs} auto auto`,
    padding: `0.2rem ${theme.space.xs}`,
    borderRadius: theme.radii.round,
    color: theme.colors.onAccent,
    background: theme.colors.accent,
    fontSize: theme.fontSizes.caption,
    fontWeight: 900,
  },
});

export const starterImageStyles = (): CSSObject => ({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  backgroundRepeat: 'no-repeat',
  '&::after': {
    content: '""',
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, transparent 32%, rgba(4, 9, 14, 0.96) 92%)',
  },
});

export const starterCopyStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  zIndex: 1,
  minWidth: 0,
  padding: theme.space.sm,
  '& strong': { display: 'block' },
  '& span': {
    display: 'block',
    marginBlockStart: '0.12rem',
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
  },
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
  aspectRatio: '4 / 5',
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

export const primaryActionRowStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  flexWrap: 'wrap',
  gap: theme.space.sm,
  paddingBlockStart: theme.space.sm,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  '& > button, & > a': { minHeight: '3rem', minWidth: '11rem' },
  '@media (max-width: 32rem)': { '& > button, & > a': { width: '100%' } },
});

export const referenceChoiceStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.md,
  padding: theme.space.lg,
  border: `1px solid ${theme.colors.accent}`,
  borderRadius: theme.radii.large,
  background: `linear-gradient(145deg, ${theme.colors.accentSoft}, ${theme.colors.surfaceSoft})`,
  '& h3': { margin: 0 },
  '& p': { margin: 0, color: theme.colors.textMuted, lineHeight: 1.5 },
});

export const referenceChoiceGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 15rem), 1fr))',
  gap: theme.space.sm,
  '& button': { minHeight: '5rem', whiteSpace: 'normal' },
});

export const stageLayoutStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.45fr) minmax(17rem, 0.55fr)',
  alignItems: 'start',
  gap: theme.space.lg,
  '@media (max-width: 64rem)': { gridTemplateColumns: '1fr' },
});

export const stageFrameStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: '24rem',
  overflow: 'hidden',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.canvasRaised,
  '& > section': { minHeight: '24rem' },
  '@media (max-width: 40rem)': { minHeight: '18rem', '& > section': { minHeight: '18rem' } },
});

export const controlPanelStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.md,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  '& h3': { margin: 0 },
  '& p': { margin: 0, color: theme.colors.textMuted, lineHeight: 1.5 },
});

export const readinessListStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  margin: 0,
  padding: 0,
  listStyle: 'none',
  '& li': {
    minHeight: '2.75rem',
    display: 'flex',
    alignItems: 'center',
    gap: theme.space.sm,
    paddingInline: theme.space.sm,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.medium,
    color: theme.colors.textMuted,
    background: theme.colors.canvasRaised,
  },
  '& [data-ready="true"]': { color: theme.colors.success },
});

export const countdownStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  inset: 0,
  zIndex: 20,
  display: 'grid',
  placeItems: 'center',
  color: theme.colors.text,
  background: 'rgba(4, 8, 12, 0.68)',
  fontFamily: theme.type.display,
  fontSize: 'clamp(5rem, 18vw, 11rem)',
  fontWeight: 900,
  textShadow: `0 0 3rem ${theme.colors.violet}`,
});

export const timerStyles = (theme: Theme, warning: boolean): CSSObject => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '2.75rem',
  paddingInline: theme.space.md,
  borderRadius: theme.radii.round,
  color: warning ? theme.colors.warning : theme.colors.text,
  background: warning ? theme.colors.warningSoft : theme.colors.canvasRaised,
  fontFamily: theme.type.mono,
  fontWeight: 900,
});

export const recordButtonStyles = (theme: Theme): CSSObject => ({
  minHeight: '3.1rem',
  color: theme.colors.text,
  borderColor: theme.colors.recording,
  background: `linear-gradient(135deg, ${theme.colors.recording}, ${theme.colors.danger})`,
  boxShadow: theme.shadows.recording,
});

export const videoPreviewStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  maxHeight: '32rem',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: '#000',
});

export const voiceLayoutStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.3fr) minmax(18rem, 0.7fr)',
  alignItems: 'start',
  gap: theme.space.lg,
  '@media (max-width: 64rem)': { gridTemplateColumns: '1fr' },
});

export const detailsGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(9rem, 1fr))',
  gap: theme.space.xs,
  margin: 0,
  '& div': {
    padding: theme.space.sm,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.medium,
    background: theme.colors.canvasRaised,
  },
  '& dt': { color: theme.colors.textMuted, fontSize: theme.fontSizes.caption },
  '& dd': { margin: `${theme.space.xxs} 0 0`, color: theme.colors.text, fontWeight: 800 },
});

export const allDoneGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: theme.space.md,
  '& a, & button': {
    minHeight: '9rem',
    display: 'grid',
    placeItems: 'center',
    padding: theme.space.lg,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.large,
    color: theme.colors.text,
    background: theme.colors.surfaceSoft,
    fontWeight: 800,
    textAlign: 'center',
    textDecoration: 'none',
  },
  '& a:focus-visible, & button:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
  '@media (max-width: 40rem)': { gridTemplateColumns: '1fr' },
});

export const projectListStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
  margin: 0,
  padding: 0,
  listStyle: 'none',
  '& li': {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: theme.space.md,
    padding: theme.space.md,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.medium,
    background: theme.colors.surfaceSoft,
  },
  '& h3': { margin: 0 },
  '& p': { margin: `${theme.space.xxs} 0 0`, color: theme.colors.textMuted },
  '@media (max-width: 36rem)': { '& li': { gridTemplateColumns: '1fr' } },
});
