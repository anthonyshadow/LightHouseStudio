import type { CSSObject, Theme } from '@emotion/react';
import { overlayBackdropAnimationStyles, overlayPanelAnimationStyles } from '../animationStyles';
import type {
  OverlayPanelBodyMode,
  OverlayPanelHeight,
  OverlayPanelPlacement,
  OverlayPanelSize,
  OverlayPhase,
} from './OverlayPanel.types';
import { media } from '../media';

export const backdropStyles = (
  theme: Theme,
  placement: OverlayPanelPlacement,
  size: OverlayPanelSize,
  phase: OverlayPhase,
  centered = false,
): CSSObject => ({
  position: 'fixed',
  inset: 0,
  zIndex: theme.layers.overlay,
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  alignItems: centered ? 'center' : placement === 'right' ? 'stretch' : 'flex-end',
  justifyContent: centered ? 'center' : 'flex-end',
  padding: centered ? theme.space.md : 0,
  overflow: 'hidden',
  background: theme.colors.scrim,
  ...overlayBackdropAnimationStyles(theme, phase === 'exiting'),
  [media.between('tablet', 'laptop')]:
    !centered && placement === 'right' && size !== 'standard'
      ? { alignItems: 'flex-end', justifyContent: 'stretch' }
      : undefined,
  [media.down('tablet')]: centered
    ? { alignItems: 'flex-end', justifyContent: 'stretch', padding: 0 }
    : undefined,
});

const panelWidth = (
  theme: Theme,
  placement: OverlayPanelPlacement,
  size: OverlayPanelSize,
): string => {
  if (placement !== 'right') return '100%';
  if (size === 'workspace') return theme.layout.overlays.drawerWorkspace;
  return size === 'wide' ? theme.layout.overlays.drawerWide : theme.layout.overlays.drawer;
};

export const panelStyles = (
  theme: Theme,
  placement: OverlayPanelPlacement,
  size: OverlayPanelSize,
  height: OverlayPanelHeight,
  phase: OverlayPhase,
  centered = false,
): CSSObject => {
  const sheet = !centered && placement === 'bottom' && height === 'sheet';
  return {
    width: centered ? 'min(64rem, 100%)' : panelWidth(theme, placement, size),
    height: centered
      ? height === 'tall'
        ? '80dvh'
        : theme.layout.overlays.bottom
      : placement === 'right' || placement === 'fullscreen'
        ? '100%'
        : height === 'tall'
          ? '75dvh'
          : theme.layout.overlays.bottom,
    maxWidth: '100%',
    maxHeight: centered
      ? 'calc(100dvh - 2rem)'
      : placement === 'bottom'
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
    borderInlineStart: placement === 'right' ? `1px solid ${theme.colors.divider}` : undefined,
    borderRadius: centered
      ? theme.radii.large
      : placement === 'right' || placement === 'fullscreen'
        ? 0
        : `${theme.radii.large} ${theme.radii.large} 0 0`,
    color: theme.colors.text,
    background: theme.colors.overlaySurface,
    boxShadow: theme.shadows.lifted,
    ...overlayPanelAnimationStyles(theme, placement, phase === 'exiting'),
    [media.downOrShort('desktop', '48rem')]: {
      width:
        !centered && placement === 'right'
          ? size === 'workspace'
            ? theme.layout.overlays.drawerWorkspaceCompact
            : size === 'wide'
              ? theme.layout.overlays.drawerWideCompact
              : undefined
          : undefined,
      height: centered
        ? height === 'tall'
          ? '86dvh'
          : undefined
        : placement === 'bottom'
          ? height === 'sheet'
            ? theme.layout.overlays.bottomSheet
            : height === 'tall'
              ? '75dvh'
              : theme.layout.overlays.bottomCompact
          : undefined,
      maxHeight: centered
        ? 'calc(100dvh - 2rem)'
        : placement === 'bottom'
          ? height === 'sheet'
            ? theme.layout.overlays.bottomSheet
            : height === 'tall'
              ? '75dvh'
              : theme.layout.overlays.bottomCompact
          : undefined,
    },
    [media.between('tablet', 'laptop')]: {
      width:
        !centered && placement === 'right'
          ? size !== 'standard'
            ? '100%'
            : theme.layout.overlays.drawerTablet
          : undefined,
      height:
        !centered && (placement === 'bottom' || (placement === 'right' && size !== 'standard'))
          ? placement === 'bottom' && height === 'tall'
            ? '75dvh'
            : theme.layout.overlays.bottomTablet
          : undefined,
      maxHeight:
        !centered && (placement === 'bottom' || (placement === 'right' && size !== 'standard'))
          ? placement === 'bottom' && height === 'tall'
            ? '75dvh'
            : theme.layout.overlays.bottomTablet
          : undefined,
      border:
        !centered && placement === 'right' && size !== 'standard'
          ? `1px solid ${theme.colors.border}`
          : undefined,
      borderRadius:
        !centered && placement === 'right' && size !== 'standard'
          ? `${theme.radii.large} ${theme.radii.large} 0 0`
          : undefined,
    },
    [media.down('tablet')]: {
      width: '100%',
      // A `sheet` is the one bottom panel that does not take the phone: it refers to the surface
      // behind it, so covering that surface would contradict what it says.
      height: centered ? '88dvh' : sheet ? theme.layout.overlays.bottomSheet : '100%',
      maxHeight: centered ? '88dvh' : sheet ? theme.layout.overlays.bottomSheet : '100dvh',
      border: centered || sheet ? `1px solid ${theme.colors.border}` : 0,
      borderInlineStart: centered ? undefined : 0,
      borderRadius: centered || sheet ? `${theme.radii.large} ${theme.radii.large} 0 0` : 0,
    },
  };
};

export const headerStyles = (theme: Theme, hasActions = false): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: hasActions
    ? 'minmax(0, 1fr) minmax(18rem, 34rem) auto'
    : 'minmax(0, 1fr) auto',
  alignItems: 'start',
  gap: theme.space.md,
  padding: `max(${theme.space.md}, env(safe-area-inset-top)) max(${theme.space.md}, env(safe-area-inset-right)) ${theme.space.md} max(${theme.space.md}, env(safe-area-inset-left))`,
  borderBlockEnd: `1px solid ${theme.colors.divider}`,
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
  borderBlockStart: `1px solid ${theme.colors.divider}`,
  background: theme.colors.overlaySurface,
});
