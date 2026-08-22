export type OverlayPanelPlacement = 'right' | 'bottom' | 'fullscreen';
export type OverlayPanelSize = 'standard' | 'wide' | 'workspace';
/**
 * `sheet` is a bottom panel that deliberately does not fill a phone: it leaves the surface it
 * refers to visible above it. Everything else keeps the standard treatment.
 */
export type OverlayPanelHeight = 'standard' | 'tall' | 'sheet';
export type OverlayPanelBodyMode = 'scroll' | 'contained';
export type OverlayPanelInitialFocus = 'first-focusable' | 'heading';
export type OverlayPhase = 'entering' | 'exiting';
