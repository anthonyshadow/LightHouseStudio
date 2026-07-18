import type { CSSObject, Theme } from '@emotion/react';

export const composerShellStyles = (theme: Theme): CSSObject => ({
  height: '100%',
  minHeight: 0,
  minWidth: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  overflow: 'hidden',
  borderRadius: 'inherit',
  background: theme.colors.surface,
});

export const composerHeaderStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  padding: theme.space.md,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  background: theme.colors.canvasRaised,
});

export const composerHeadingStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  gap: `${theme.space.xxs} ${theme.space.xs}`,
  alignItems: 'center',
  '& [aria-hidden="true"]': {
    color: theme.colors.accent,
    fontSize: theme.fontSizes.label,
    lineHeight: 1,
  },
  '& h2': {
    minWidth: 0,
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: theme.fontSizes.label,
    letterSpacing: '0.045em',
    textTransform: 'uppercase',
  },
  '& p': {
    gridColumn: '1 / -1',
    minWidth: 0,
    margin: 0,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
  },
});

export const composerBodyStyles = (theme: Theme): CSSObject => ({
  minHeight: 0,
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.md,
  padding: `calc(${theme.space.md} + 3px)`,
  overflowY: 'auto',
  overflowX: 'hidden',
  overscrollBehavior: 'contain',
  scrollbarGutter: 'stable',
  '& > *': { minWidth: 0 },
});

export const composerFooterStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.xs,
  padding: theme.space.md,
  paddingBlockEnd: `max(${theme.space.md}, env(safe-area-inset-bottom))`,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  background: theme.colors.canvasRaised,
});

export const composerActionsStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: theme.space.xs,
  '& > button': {
    minWidth: 0,
    width: '100%',
    overflowWrap: 'anywhere',
  },
  '& > button:first-of-type': { gridColumn: '1 / -1' },
  '@media (max-width: 22rem), (max-height: 36rem)': {
    gridTemplateColumns: '1fr',
    '& > button': { gridColumn: '1' },
  },
});

export const actionReasonStyles = (theme: Theme): CSSObject => ({
  gridColumn: '1 / -1',
  margin: 0,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.caption,
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
});

export const recipeFieldsStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.md,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.surfaceSoft,
  '& textarea': {
    minHeight: '7rem',
    maxHeight: '15rem',
    resize: 'vertical',
  },
});

export const recipeFieldsHeadingStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.xxs,
  '& h3': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: theme.fontSizes.body,
  },
  '& p': {
    margin: 0,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.45,
  },
});

export const sessionSummaryStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
  '& header': {
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  '& h3': { minWidth: 0, margin: 0, fontSize: theme.fontSizes.body },
  '& header span': {
    flex: '0 0 auto',
    padding: `${theme.space.xxs} ${theme.space.xs}`,
    borderRadius: theme.radii.round,
    color: theme.colors.success,
    background: theme.colors.successSoft,
    fontSize: theme.fontSizes.caption,
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  '& > p': {
    display: '-webkit-box',
    margin: 0,
    overflow: 'hidden',
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.5,
    overflowWrap: 'anywhere',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 3,
  },
  '& dl': {
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
    gap: theme.space.xs,
    margin: 0,
  },
  '& dl div': { minWidth: 0 },
  '& dt': { color: theme.colors.textFaint, fontSize: theme.fontSizes.caption },
  '& dd': {
    margin: `${theme.space.xxs} 0 0`,
    color: theme.colors.text,
    fontSize: theme.fontSizes.caption,
    overflowWrap: 'anywhere',
  },
});

export const referenceFieldStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.xs,
});

export const referenceFileAreaStyles = (
  theme: Theme,
  dragging = false,
  disabled = false,
): CSSObject => ({
  position: 'relative',
  minWidth: 0,
  display: 'grid',
  placeItems: 'stretch',
  minHeight: '6.25rem',
  border: `1px dashed ${dragging ? theme.colors.accent : theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.textMuted,
  background: dragging ? theme.colors.accentSoft : theme.colors.canvasRaised,
  transition: `border-color ${theme.motion.quick}, background ${theme.motion.quick}`,
  opacity: disabled ? 0.55 : 1,
  '&:focus-within': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
  '& input': {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

export const referencePickerStyles = (theme: Theme, disabled = false): CSSObject => ({
  minWidth: 0,
  minHeight: '6.25rem',
  display: 'grid',
  placeContent: 'center',
  gap: theme.space.xxs,
  padding: theme.space.md,
  textAlign: 'center',
  cursor: disabled ? 'not-allowed' : 'pointer',
  '& strong': { color: theme.colors.text, fontSize: theme.fontSizes.body },
  '& span': { color: theme.colors.textMuted, fontSize: theme.fontSizes.caption, lineHeight: 1.4 },
});

export const referenceGuidanceStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.xxs,
  '& label': { color: theme.colors.text, fontWeight: 760, fontSize: theme.fontSizes.body },
  '& span': {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.45,
    overflowWrap: 'anywhere',
  },
});

export const referencePreviewStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: '4rem minmax(0, 1fr) auto',
  gap: theme.space.sm,
  alignItems: 'center',
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
  '& img': {
    width: '4rem',
    height: '4rem',
    borderRadius: theme.radii.small,
    objectFit: 'cover',
    border: `1px solid ${theme.colors.border}`,
  },
  '& > div': {
    minWidth: 0,
    display: 'grid',
    gap: theme.space.xxs,
  },
  '& strong': {
    minWidth: 0,
    display: '-webkit-box',
    overflow: 'hidden',
    color: theme.colors.text,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
  },
  '& span': { color: theme.colors.textMuted, fontSize: theme.fontSizes.caption },
  '& small': {
    color: theme.colors.textFaint,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
  },
  '& button': { minWidth: '2.75rem', minHeight: '2.75rem', paddingInline: theme.space.sm },
  '@media (max-width: 22rem)': {
    gridTemplateColumns: '3.25rem minmax(0, 1fr) auto',
    '& img': { width: '3.25rem', height: '3.25rem' },
    '& small': { display: 'none' },
  },
});

export const enhancementToggleStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  alignItems: 'flex-start',
  gap: theme.space.sm,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.metadata,
  lineHeight: 1.45,
  '& input': {
    flex: '0 0 auto',
    width: '1.1rem',
    height: '1.1rem',
    marginTop: '0.1rem',
    accentColor: theme.colors.accent,
  },
  '& span': { minWidth: 0, overflowWrap: 'anywhere' },
  '& strong': { display: 'block', color: theme.colors.text },
});

export const providerDisclosureStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  color: theme.colors.textFaint,
  fontSize: theme.fontSizes.caption,
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
});
