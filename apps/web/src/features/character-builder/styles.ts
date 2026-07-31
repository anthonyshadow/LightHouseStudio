import type { CSSObject, Theme } from '@emotion/react';

export const characterBuilderShellStyles = (theme: Theme): CSSObject => ({
  width: `calc(100% + ${theme.space.xl})`,
  height: `calc(100% + ${theme.space.xl})`,
  minWidth: 0,
  minHeight: 0,
  margin: `-${theme.space.md}`,
  overflow: 'hidden',
  overscrollBehavior: 'contain',
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
  gridTemplateColumns: 'minmax(0, 1fr) repeat(5, auto)',
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
    gap: '8px',
    '& > span': { gridColumn: '1 / -1' },
    '& > button': { width: '100%' },
  },
  '@media (max-width: 39.99rem) and (max-height: 36rem)': {
    '& > span[data-footer-status="default"]': { display: 'none' },
  },
});
