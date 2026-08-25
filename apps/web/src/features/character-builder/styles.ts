import type { CSSObject, Theme } from '@emotion/react';
import { media } from '../../ui/media';

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
  /*
   * The status line takes the free column and every control gets its own after it. A track count
   * would have to be kept in step with a footer whose buttons are conditional — and was not: four
   * tracks held five children on step two, which wrapped Save onto its own row.
   */
  gridTemplateColumns: 'minmax(0, 1fr)',
  gridAutoFlow: 'column',
  gridAutoColumns: 'auto',
  alignItems: 'center',
  gap: theme.space.sm,
  paddingBlockEnd: 'env(safe-area-inset-bottom)',
  '& > span': {
    minWidth: 0,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
  },
  [media.down('tablet')]: {
    gridTemplateColumns: '1fr 1fr',
    gridAutoFlow: 'row',
    gap: '8px',
    '& > span': { gridColumn: '1 / -1' },
    '& > button': { width: '100%' },
  },
  [`${media.down('tablet')} and (max-height: 36rem)`]: {
    '& > span[data-footer-status="default"]': { display: 'none' },
  },
});
