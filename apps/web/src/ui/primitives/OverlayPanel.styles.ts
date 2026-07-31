import type { CSSObject, Theme } from '@emotion/react';
import { overlayBackdropAnimationStyles, overlayPanelAnimationStyles } from '../animationStyles';
import type {
  OverlayPanelBodyMode,
  OverlayPanelHeight,
  OverlayPanelPlacement,
  OverlayPanelSize,
  OverlayPhase,
} from './OverlayPanel.types';

export const backdropStyles = (
  theme: Theme,
  placement: OverlayPanelPlacement,
  size: OverlayPanelSize,
  phase: OverlayPhase,
): CSSObject => ({
  position: 'fixed',
  inset: 0,
  zIndex: theme.layers.overlay,
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  alignItems: placement === 'right' ? 'stretch' : 'flex-end',
  justifyContent: 'flex-end',
  overflow: 'hidden',
  background: theme.colors.scrim,
  ...overlayBackdropAnimationStyles(theme, phase === 'exiting'),
  '@media (min-width: 40rem) and (max-width: 63.99rem)':
    placement === 'right' && size === 'wide'
      ? { alignItems: 'flex-end', justifyContent: 'stretch' }
      : undefined,
});

const panelWidth = (
  theme: Theme,
  placement: OverlayPanelPlacement,
  size: OverlayPanelSize,
): string => {
  if (placement !== 'right') return '100%';
  return size === 'wide' ? theme.layout.overlays.drawerWide : theme.layout.overlays.drawer;
};

export const panelStyles = (
  theme: Theme,
  placement: OverlayPanelPlacement,
  size: OverlayPanelSize,
  height: OverlayPanelHeight,
  phase: OverlayPhase,
): CSSObject => ({
  width: panelWidth(theme, placement, size),
  height:
    placement === 'right' || placement === 'fullscreen'
      ? '100%'
      : height === 'tall'
        ? '75dvh'
        : theme.layout.overlays.bottom,
  maxWidth: '100%',
  maxHeight:
    placement === 'bottom'
      ? height === 'tall'
        ? '75dvh'
        : theme.layout.overlays.bottom
      : '100dvh',
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  overflow: 'hidden',
  border: placement === 'right' ? 0 : `1px solid ${theme.colors.border}`,
  borderInlineStart: placement === 'right' ? `1px solid ${theme.colors.border}` : undefined,
  borderRadius:
    placement === 'right' || placement === 'fullscreen'
      ? 0
      : `${theme.radii.large} ${theme.radii.large} 0 0`,
  color: theme.colors.text,
  background: theme.colors.overlaySurface,
  boxShadow: theme.shadows.lifted,
  ...overlayPanelAnimationStyles(theme, placement, phase === 'exiting'),
  '@media (max-width: 80rem), (max-height: 48rem)': {
    width:
      placement === 'right' && size === 'wide'
        ? theme.layout.overlays.drawerWideCompact
        : undefined,
    height:
      placement === 'bottom'
        ? height === 'tall'
          ? '75dvh'
          : theme.layout.overlays.bottomCompact
        : undefined,
    maxHeight:
      placement === 'bottom'
        ? height === 'tall'
          ? '75dvh'
          : theme.layout.overlays.bottomCompact
        : undefined,
  },
  '@media (min-width: 40rem) and (max-width: 63.99rem)': {
    width:
      placement === 'right'
        ? size === 'wide'
          ? '100%'
          : theme.layout.overlays.drawerTablet
        : undefined,
    height:
      placement === 'bottom' || (placement === 'right' && size === 'wide')
        ? placement === 'bottom' && height === 'tall'
          ? '75dvh'
          : theme.layout.overlays.bottomTablet
        : undefined,
    maxHeight:
      placement === 'bottom' || (placement === 'right' && size === 'wide')
        ? placement === 'bottom' && height === 'tall'
          ? '75dvh'
          : theme.layout.overlays.bottomTablet
        : undefined,
    border:
      placement === 'right' && size === 'wide' ? `1px solid ${theme.colors.border}` : undefined,
    borderRadius:
      placement === 'right' && size === 'wide'
        ? `${theme.radii.large} ${theme.radii.large} 0 0`
        : undefined,
  },
  '@media (max-width: 40rem)': {
    width: '100%',
    height: '100%',
    maxHeight: '100dvh',
    border: 0,
    borderInlineStart: 0,
    borderRadius: 0,
  },
});

export const headerStyles = (theme: Theme, hasActions = false): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: hasActions
    ? 'minmax(0, 1fr) minmax(18rem, 34rem) auto'
    : 'minmax(0, 1fr) auto',
  alignItems: 'start',
  gap: theme.space.md,
  padding: `max(${theme.space.md}, env(safe-area-inset-top)) max(${theme.space.md}, env(safe-area-inset-right)) ${theme.space.md} max(${theme.space.md}, env(safe-area-inset-left))`,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  background: theme.colors.overlaySurface,
  '@media (max-width: 56rem)': hasActions
    ? {
        gridTemplateColumns: 'minmax(0, 1fr) auto',
        '& > [data-overlay-header-copy]': { gridColumn: '1' },
        '& > [data-overlay-header-actions]': { gridColumn: '1 / -1', gridRow: '2' },
        '& > [data-overlay-header-close]': { gridColumn: '2', gridRow: '1' },
      }
    : undefined,
  '@media (max-height: 36rem)': {
    alignItems: 'center',
    padding: `max(${theme.space.sm}, env(safe-area-inset-top)) max(${theme.space.sm}, env(safe-area-inset-right)) ${theme.space.sm} max(${theme.space.sm}, env(safe-area-inset-left))`,
  },
});

export const headerCopyStyles = (): CSSObject => ({ minWidth: 0 });

export const headerActionsStyles = (): CSSObject => ({
  minWidth: 0,
});

export const headerCloseStyles = (): CSSObject => ({});

export const headingStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  margin: 0,
  color: theme.colors.text,
  fontFamily: theme.type.display,
  fontSize: theme.fontSizes.section,
  lineHeight: 1.3,
  overflowWrap: 'anywhere',
});

export const descriptionStyles = (theme: Theme): CSSObject => ({
  margin: `${theme.space.xs} 0 0`,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.body,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
  '@media (max-height: 36rem)': { display: 'none' },
});

export const bodyStyles = (theme: Theme, bodyMode: OverlayPanelBodyMode): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  padding: `${theme.space.md} max(${theme.space.md}, env(safe-area-inset-right)) max(${theme.space.md}, env(safe-area-inset-bottom)) max(${theme.space.md}, env(safe-area-inset-left))`,
  overflow: bodyMode === 'scroll' ? 'auto' : 'hidden',
  overscrollBehavior: 'contain',
  scrollbarGutter: bodyMode === 'scroll' ? 'stable' : undefined,
});

export const footerStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  padding: `${theme.space.md} max(${theme.space.md}, env(safe-area-inset-right)) max(${theme.space.md}, env(safe-area-inset-bottom)) max(${theme.space.md}, env(safe-area-inset-left))`,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  background: theme.colors.overlaySurface,
});
