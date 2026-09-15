import type { CSSObject, Theme } from '@emotion/react';
import { media } from '../../ui/media';

export const compositionSurfaceStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space.md,
  minHeight: 0,
  padding: theme.space.md,
});

export const compositionLayoutStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  // The preview takes the room; the inspector is a column beside it and a row under it when the
  // viewport cannot hold both, which is the same order a screen reader reads them in either way.
  gridTemplateColumns: 'minmax(0, 1fr) minmax(16rem, 20rem)',
  gap: theme.space.md,
  minHeight: 0,
  [media.down('laptop')]: { gridTemplateColumns: 'minmax(0, 1fr)' },
});

export const compositionPreviewStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space.sm,
  minWidth: 0,
  '& video': {
    width: '100%',
    maxHeight: '48vh',
    borderRadius: theme.radii.medium,
    background: theme.colors.surfaceSoft,
  },
});

export const compositionInspectorStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space.sm,
  minWidth: 0,
});

export const clipStripStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  gap: theme.space.xs,
  margin: 0,
  padding: theme.space.xs,
  listStyle: 'none',
  overflowX: 'auto',
  background: theme.colors.surfaceSoft,
  borderRadius: theme.radii.medium,
  // The strip is the one thing on this surface allowed to scroll sideways; the page must not.
  scrollbarWidth: 'thin',
});

export const clipTileStyles = (theme: Theme, selected: boolean): CSSObject => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 2,
  flex: '0 0 auto',
  minWidth: '7rem',
  maxWidth: '14rem',
  padding: theme.space.xs,
  textAlign: 'left',
  cursor: 'pointer',
  border: `2px solid ${selected ? theme.colors.accent : 'transparent'}`,
  borderRadius: theme.radii.small,
  background: selected ? theme.colors.surfaceStrong : theme.colors.surface,
  color: theme.colors.text,
  '& small': { color: theme.colors.textMuted },
  '&[data-unresolved="true"]': { borderStyle: 'dashed', borderColor: theme.colors.warning },
});

export const clipStripCaptionStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.space.xs,
  color: theme.colors.textMuted,
});
