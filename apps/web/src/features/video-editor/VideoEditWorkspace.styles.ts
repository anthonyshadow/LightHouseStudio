import type { CSSObject, Theme } from '@emotion/react';

export const editToolRailStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.space.xs,
  minWidth: 0,
  minHeight: 0,
  padding: theme.space.xxs,
  border: `1px solid ${theme.colors.surfaceStrong}`,
  borderRadius: theme.radii.large,
  background: theme.colors.canvasRaised,
  overflowX: 'auto',
  overflowY: 'hidden',
  scrollbarWidth: 'thin',
  '& button': {
    minWidth: '4.75rem',
    minHeight: '2.75rem',
    display: 'grid',
    placeItems: 'center',
    padding: `${theme.space.xs} ${theme.space.sm}`,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.medium,
    color: theme.colors.textMuted,
    background: theme.colors.surface,
    fontWeight: 760,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  },
  '& button[aria-current="page"]': {
    borderColor: theme.colors.accent,
    color: theme.colors.accent,
    background: theme.colors.accentSoft,
  },
  '& button:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
  '@media (min-width: 64rem)': {
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: theme.space.sm,
    overflowX: 'hidden',
    overflowY: 'auto',
    '& button': {
      minWidth: 0,
      minHeight: '3.75rem',
      justifyItems: 'start',
      textAlign: 'start',
    },
    '& [data-edit-rail-reset]': { marginBlockStart: 'auto' },
  },
});

export const editSettingsStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surface,
  overflow: 'hidden',
  '& > header': {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: theme.space.xs,
    padding: theme.space.sm,
    borderBlockEnd: `1px solid ${theme.colors.border}`,
    background: theme.colors.surfaceStrong,
  },
  '& > header h2': { margin: 0, fontSize: theme.fontSizes.body },
  '& [data-editor-history]': { display: 'flex', gap: theme.space.xxs },
  '& [data-editor-history] button': {
    minWidth: '2.75rem',
    minHeight: '2.75rem',
    padding: theme.space.xxs,
  },
});

export const editSettingsBodyStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.md,
  padding: theme.space.md,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  scrollbarWidth: 'thin',
  '& h3': { margin: 0, fontSize: theme.fontSizes.body },
  '& p': { margin: 0, color: theme.colors.textMuted, fontSize: theme.fontSizes.metadata },
  '@media (max-width: 63.99rem)': {
    padding: theme.space.sm,
    gap: theme.space.sm,
  },
});

export const rangeFieldStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  '& > span': {
    display: 'flex',
    justifyContent: 'space-between',
    gap: theme.space.sm,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    fontWeight: 700,
  },
  '& output': { color: theme.colors.accent, fontFamily: theme.type.mono },
  '& input': { width: '100%', minHeight: '2.75rem', accentColor: theme.colors.accent },
  '& input:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '2px' },
});

export const optionGridStyles = (theme: Theme, columns = 2): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
  gap: theme.space.xs,
  '& button': {
    minHeight: '2.75rem',
    padding: theme.space.xs,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.small,
    color: theme.colors.textMuted,
    background: theme.colors.surfaceSoft,
    fontWeight: 700,
    cursor: 'pointer',
  },
  '& button[aria-pressed="true"]': {
    borderColor: theme.colors.accent,
    color: theme.colors.accent,
    background: theme.colors.accentSoft,
  },
  '& button:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '2px' },
});

export const editorFooterStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  padding: theme.space.sm,
  paddingBlockEnd: `max(${theme.space.sm}, env(safe-area-inset-bottom))`,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  background: theme.colors.surfaceStrong,
  '& [data-editor-primary-actions]': {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: theme.space.xs,
  },
});

export const renderProgressStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  padding: theme.space.sm,
  border: `1px solid color-mix(in srgb, ${theme.colors.accent} 35%, transparent)`,
  borderRadius: theme.radii.medium,
  color: theme.colors.accent,
  background: theme.colors.accentSoft,
  '& span': { display: 'flex', justifyContent: 'space-between', gap: theme.space.sm },
  '& progress': { width: '100%', accentColor: theme.colors.accent },
});
