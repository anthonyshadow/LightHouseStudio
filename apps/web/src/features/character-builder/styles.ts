import type { CSSObject, Theme } from '@emotion/react';

export const characterBuilderShellStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  overflow: 'auto',
  overscrollBehavior: 'contain',
  padding: `0 max(${theme.space.md}, env(safe-area-inset-right)) max(${theme.space.xl}, env(safe-area-inset-bottom)) max(${theme.space.md}, env(safe-area-inset-left))`,
  scrollbarGutter: 'stable',
  '@media (max-width: 39.99rem)': {
    paddingInlineStart: `max(${theme.space.sm}, env(safe-area-inset-left))`,
    paddingInlineEnd: `max(${theme.space.sm}, env(safe-area-inset-right))`,
  },
});

export const characterBuilderStatusStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  marginBlockEnd: theme.space.md,
});

export const characterBuilderPreviewActionsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.sm,
  '& > button': { flex: '1 1 10rem' },
});

export const characterBuilderFooterStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto auto',
  alignItems: 'center',
  gap: theme.space.sm,
  paddingBlockEnd: 'env(safe-area-inset-bottom)',
  '& > span': {
    minWidth: 0,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
  },
  '@media (max-width: 39.99rem)': {
    gridTemplateColumns: '1fr 1fr',
    '& > span': { gridColumn: '1 / -1' },
    '& > button': { width: '100%' },
  },
});
