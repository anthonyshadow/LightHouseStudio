import { keyframes, useTheme, type CSSObject, type Theme } from '@emotion/react';
import {
  forwardRef,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconButton';

export type OverlayPanelPlacement = 'right' | 'bottom' | 'fullscreen';
export type OverlayPanelSize = 'standard' | 'wide';
export type OverlayPanelBodyMode = 'scroll' | 'contained';
export type OverlayPanelInitialFocus = 'first-focusable' | 'heading';

export interface OverlayPanelProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  placement?: OverlayPanelPlacement;
  size?: OverlayPanelSize;
  closeLabel?: string;
  closeDisabled?: boolean;
  closeOnBackdrop?: boolean;
  initialFocus?: OverlayPanelInitialFocus;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
  bodyMode?: OverlayPanelBodyMode;
}

type OverlayPhase = 'entering' | 'exiting';

interface OverlayStackEntry {
  id: string;
  root: HTMLElement;
}

interface IsolationSnapshot {
  hadAriaHidden: boolean;
  ariaHidden: string | null;
  hadInertAttribute: boolean;
  inertAttribute: string | null;
  inertProperty: boolean;
}

const OVERLAY_EXIT_DURATION_MS = 220;
const overlayStack: OverlayStackEntry[] = [];
const isolationSnapshots = new Map<HTMLElement, IsolationSnapshot>();
let unlockedBodyOverflow: { value: string; priority: string } | null = null;

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'audio[controls]',
  'video[controls]',
  'details > summary:first-of-type',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const hasInertState = (element: HTMLElement) => {
  const inertElement = element as HTMLElement & { inert?: boolean };
  return element.hasAttribute('inert') || inertElement.inert === true;
};

const isHiddenOrInert = (element: HTMLElement, boundary?: HTMLElement) => {
  let current: HTMLElement | null = element;

  while (current) {
    if (
      current.hidden ||
      current.getAttribute('aria-hidden') === 'true' ||
      hasInertState(current)
    ) {
      return true;
    }

    const styles = window.getComputedStyle(current);
    if (
      styles.display === 'none' ||
      styles.visibility === 'hidden' ||
      styles.visibility === 'collapse'
    ) {
      return true;
    }

    if (current === boundary) break;
    current = current.parentElement;
  }

  return false;
};

const isFocusableElement = (element: HTMLElement, boundary: HTMLElement) => {
  if (!element.matches(focusableSelector) || element.matches(':disabled')) return false;
  if (element instanceof HTMLInputElement && element.type === 'hidden') return false;
  if (element.hasAttribute('tabindex') && element.tabIndex < 0) return false;

  const closedDetails = element.closest('details:not([open])');
  if (closedDetails && closedDetails.querySelector(':scope > summary') !== element) return false;

  return !isHiddenOrInert(element, boundary);
};

const getFocusableElements = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) =>
    isFocusableElement(element, container),
  );

const snapshotIsolation = (element: HTMLElement): IsolationSnapshot => {
  const inertElement = element as HTMLElement & { inert?: boolean };
  return {
    hadAriaHidden: element.hasAttribute('aria-hidden'),
    ariaHidden: element.getAttribute('aria-hidden'),
    hadInertAttribute: element.hasAttribute('inert'),
    inertAttribute: element.getAttribute('inert'),
    inertProperty: inertElement.inert === true,
  };
};

const isolateElement = (element: HTMLElement) => {
  if (!isolationSnapshots.has(element)) {
    isolationSnapshots.set(element, snapshotIsolation(element));
  }

  element.setAttribute('aria-hidden', 'true');
  element.setAttribute('inert', '');
  (element as HTMLElement & { inert?: boolean }).inert = true;
};

const restoreIsolatedElement = (element: HTMLElement) => {
  const snapshot = isolationSnapshots.get(element);
  if (!snapshot) return;

  const inertElement = element as HTMLElement & { inert?: boolean };
  inertElement.inert = snapshot.inertProperty;

  if (snapshot.hadInertAttribute) {
    element.setAttribute('inert', snapshot.inertAttribute ?? '');
  } else {
    element.removeAttribute('inert');
  }

  if (snapshot.hadAriaHidden) {
    element.setAttribute('aria-hidden', snapshot.ariaHidden ?? '');
  } else {
    element.removeAttribute('aria-hidden');
  }

  isolationSnapshots.delete(element);
};

const isBackgroundElement = (element: Element): element is HTMLElement =>
  element instanceof HTMLElement &&
  !['SCRIPT', 'STYLE', 'LINK', 'TEMPLATE'].includes(element.tagName);

const synchronizeModalIsolation = () => {
  const topmost = overlayStack.at(-1);
  const targets = new Set<HTMLElement>();

  if (topmost) {
    for (const child of Array.from(document.body.children)) {
      if (child !== topmost.root && isBackgroundElement(child)) targets.add(child);
    }

    for (const entry of overlayStack) {
      if (entry === topmost) continue;
      const dialog = entry.root.querySelector<HTMLElement>('[role="dialog"]');
      if (dialog) targets.add(dialog);
    }
  }

  for (const element of Array.from(isolationSnapshots.keys())) {
    if (!targets.has(element)) restoreIsolatedElement(element);
  }

  for (const element of targets) isolateElement(element);
};

const isTopmostOverlay = (id: string) => overlayStack.at(-1)?.id === id;

const getTopmostDialog = () =>
  overlayStack.at(-1)?.root.querySelector<HTMLElement>('[role="dialog"]') ?? null;

const registerOverlay = (entry: OverlayStackEntry) => {
  const duplicateIndex = overlayStack.findIndex(({ id }) => id === entry.id);
  if (duplicateIndex >= 0) overlayStack.splice(duplicateIndex, 1);

  if (overlayStack.length === 0) {
    unlockedBodyOverflow = {
      value: document.body.style.getPropertyValue('overflow'),
      priority: document.body.style.getPropertyPriority('overflow'),
    };
    document.body.style.setProperty('overflow', 'hidden');
  }

  overlayStack.push(entry);
  synchronizeModalIsolation();

  let registered = true;
  return () => {
    if (!registered) return;
    registered = false;

    const stackIndex = overlayStack.findIndex(({ id }) => id === entry.id);
    if (stackIndex >= 0) overlayStack.splice(stackIndex, 1);
    synchronizeModalIsolation();

    if (overlayStack.length === 0 && unlockedBodyOverflow) {
      if (unlockedBodyOverflow.value) {
        document.body.style.setProperty(
          'overflow',
          unlockedBodyOverflow.value,
          unlockedBodyOverflow.priority,
        );
      } else {
        document.body.style.removeProperty('overflow');
      }
      unlockedBodyOverflow = null;
    }
  };
};

const canRestoreFocus = (element: HTMLElement | null) =>
  Boolean(element?.isConnected && !element.matches(':disabled') && !isHiddenOrInert(element));

const focusTopmostDialog = () => {
  const dialog = getTopmostDialog();
  if (!dialog) return;
  (getFocusableElements(dialog)[0] ?? dialog).focus();
};

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const fadeOut = keyframes({
  from: { opacity: 1 },
  to: { opacity: 0 },
});

const slideInRight = keyframes({
  from: { opacity: 0, transform: 'translateX(1rem)' },
  to: { opacity: 1, transform: 'translateX(0)' },
});

const slideOutRight = keyframes({
  from: { opacity: 1, transform: 'translateX(0)' },
  to: { opacity: 0, transform: 'translateX(1rem)' },
});

const slideInBottom = keyframes({
  from: { opacity: 0, transform: 'translateY(1rem)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

const slideOutBottom = keyframes({
  from: { opacity: 1, transform: 'translateY(0)' },
  to: { opacity: 0, transform: 'translateY(1rem)' },
});

const backdropStyles = (
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
  animation: `${phase === 'exiting' ? fadeOut : fadeIn} ${theme.motion.standard} both`,
  '@media (prefers-reduced-motion: reduce)': {
    animation: 'none',
  },
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

const panelAnimation = (placement: OverlayPanelPlacement, phase: OverlayPhase) => {
  switch (placement) {
    case 'right':
      return phase === 'exiting' ? slideOutRight : slideInRight;
    case 'bottom':
      return phase === 'exiting' ? slideOutBottom : slideInBottom;
    case 'fullscreen':
      return phase === 'exiting' ? fadeOut : fadeIn;
  }
};

const panelStyles = (
  theme: Theme,
  placement: OverlayPanelPlacement,
  size: OverlayPanelSize,
  phase: OverlayPhase,
): CSSObject => ({
  width: panelWidth(theme, placement, size),
  height:
    placement === 'right' || placement === 'fullscreen' ? '100%' : theme.layout.overlays.bottom,
  maxWidth: '100%',
  maxHeight: placement === 'bottom' ? theme.layout.overlays.bottom : '100dvh',
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
  animation: `${panelAnimation(placement, phase)} ${theme.motion.standard} both`,
  willChange: 'transform, opacity',
  '@media (prefers-reduced-motion: reduce)': {
    animation: 'none',
  },
  '@media (max-width: 80rem), (max-height: 48rem)': {
    width:
      placement === 'right' && size === 'wide'
        ? theme.layout.overlays.drawerWideCompact
        : undefined,
    height: placement === 'bottom' ? theme.layout.overlays.bottomCompact : undefined,
    maxHeight: placement === 'bottom' ? theme.layout.overlays.bottomCompact : undefined,
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
        ? theme.layout.overlays.bottomTablet
        : undefined,
    maxHeight:
      placement === 'bottom' || (placement === 'right' && size === 'wide')
        ? theme.layout.overlays.bottomTablet
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

const headerStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'start',
  gap: theme.space.md,
  padding: `max(${theme.space.md}, env(safe-area-inset-top)) max(${theme.space.md}, env(safe-area-inset-right)) ${theme.space.md} max(${theme.space.md}, env(safe-area-inset-left))`,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  background: theme.colors.overlaySurface,
  '@media (max-height: 36rem)': {
    alignItems: 'center',
    padding: `max(${theme.space.sm}, env(safe-area-inset-top)) max(${theme.space.sm}, env(safe-area-inset-right)) ${theme.space.sm} max(${theme.space.sm}, env(safe-area-inset-left))`,
  },
});

const headingStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  margin: 0,
  color: theme.colors.text,
  fontFamily: theme.type.display,
  fontSize: theme.fontSizes.section,
  lineHeight: 1.3,
  overflowWrap: 'anywhere',
});

const descriptionStyles = (theme: Theme): CSSObject => ({
  margin: `${theme.space.xs} 0 0`,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.body,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
  '@media (max-height: 36rem)': { display: 'none' },
});

const bodyStyles = (theme: Theme, bodyMode: OverlayPanelBodyMode): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  padding: `${theme.space.md} max(${theme.space.md}, env(safe-area-inset-right)) max(${theme.space.md}, env(safe-area-inset-bottom)) max(${theme.space.md}, env(safe-area-inset-left))`,
  overflow: bodyMode === 'scroll' ? 'auto' : 'hidden',
  overscrollBehavior: 'contain',
  scrollbarGutter: bodyMode === 'scroll' ? 'stable' : undefined,
});

const footerStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  padding: `${theme.space.md} max(${theme.space.md}, env(safe-area-inset-right)) max(${theme.space.md}, env(safe-area-inset-bottom)) max(${theme.space.md}, env(safe-area-inset-left))`,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  background: theme.colors.overlaySurface,
});

export const OverlayPanel = forwardRef<HTMLDivElement, OverlayPanelProps>(function OverlayPanel(
  {
    open,
    onClose,
    title,
    description,
    children,
    footer,
    placement = 'right',
    size = 'standard',
    closeLabel = 'Close panel',
    closeDisabled = false,
    closeOnBackdrop = true,
    initialFocus = 'first-focusable',
    initialFocusRef,
    returnFocusRef,
    bodyMode = 'scroll',
  },
  forwardedRef,
) {
  const theme = useTheme();
  const reactId = useId();
  const overlayId = `overlay-${reactId}`;
  const titleId = `${reactId}-title`;
  const descriptionId = `${reactId}-description`;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  const openRef = useRef(open);
  const closeDisabledRef = useRef(closeDisabled);
  const initialFocusTargetRef = useRef(initialFocusRef);
  const returnFocusTargetRef = useRef(returnFocusRef);
  const [present, setPresent] = useState(open && typeof document !== 'undefined');
  const [phase, setPhase] = useState<OverlayPhase>('entering');

  onCloseRef.current = onClose;
  openRef.current = open;
  closeDisabledRef.current = closeDisabled;
  initialFocusTargetRef.current = initialFocusRef;
  returnFocusTargetRef.current = returnFocusRef;

  useEffect(() => {
    if (open) {
      setPresent(true);
      setPhase('entering');
      return;
    }

    if (!present) return;
    setPhase('exiting');

    if (prefersReducedMotion()) {
      setPresent(false);
      return;
    }

    const exitTimer = window.setTimeout(() => {
      setPresent(false);
    }, OVERLAY_EXIT_DURATION_MS);

    return () => window.clearTimeout(exitTimer);
  }, [open, present]);

  useLayoutEffect(() => {
    if (!present) return;

    const root = backdropRef.current;
    if (!root) return;

    const opener =
      returnFocusTargetRef.current?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const panel = panelRef.current;
    const preferredTarget = initialFocusTargetRef.current?.current;
    const initialTarget =
      preferredTarget &&
      panel?.contains(preferredTarget) &&
      isFocusableElement(preferredTarget, panel)
        ? preferredTarget
        : initialFocus === 'heading'
          ? headingRef.current
          : panel
            ? (getFocusableElements(panel)[0] ?? panel)
            : null;

    // Move focus out of the application root before aria-hiding it. Browsers may reject
    // aria-hidden on an ancestor that still contains the active element.
    initialTarget?.focus();
    const unregister = registerOverlay({ id: overlayId, root });

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel || !isTopmostOverlay(overlayId)) return;

      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        if (openRef.current && !closeDisabledRef.current) onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;

      const activeElement = document.activeElement;
      if (event.shiftKey && (activeElement === first || !panel.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !panel.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      unregister();

      queueMicrotask(() => {
        const returnTarget = returnFocusTargetRef.current?.current ?? opener;
        if (canRestoreFocus(returnTarget)) returnTarget?.focus();
        else focusTopmostDialog();
      });
    };
  }, [initialFocus, overlayId, present]);

  if (!present || typeof document === 'undefined') return null;

  const requestClose = () => {
    if (openRef.current && !closeDisabledRef.current && isTopmostOverlay(overlayId))
      onCloseRef.current();
  };

  const interceptBackdropEvent = (
    event: React.PointerEvent<HTMLDivElement> | React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.target !== event.currentTarget) return;
    event.preventDefault();
    event.stopPropagation();
  };

  return createPortal(
    <div
      ref={backdropRef}
      role="presentation"
      data-overlay-panel-root=""
      data-overlay-state={phase}
      css={backdropStyles(theme, placement, size, phase)}
      onPointerDownCapture={(event) => {
        if (event.target !== event.currentTarget) return;
        interceptBackdropEvent(event);
        if (closeOnBackdrop) requestClose();
      }}
      onPointerUpCapture={interceptBackdropEvent}
      onClickCapture={interceptBackdropEvent}
    >
      <div
        ref={(node) => {
          panelRef.current = node;
          if (typeof forwardedRef === 'function') forwardedRef(node);
          else if (forwardedRef) forwardedRef.current = node;
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        css={panelStyles(theme, placement, size, phase)}
      >
        <header css={headerStyles(theme)}>
          <div css={{ minWidth: 0 }}>
            <h2 ref={headingRef} id={titleId} tabIndex={-1} css={headingStyles(theme)}>
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} css={descriptionStyles(theme)}>
                {description}
              </p>
            ) : null}
          </div>
          <IconButton
            label={closeLabel}
            variant="quiet"
            disabled={closeDisabled}
            onClick={requestClose}
          >
            <span aria-hidden="true" css={{ fontSize: '1.5rem', lineHeight: 1 }}>
              ×
            </span>
          </IconButton>
        </header>

        <div
          data-scroll-region="overlay-panel"
          data-overlay-body-mode={bodyMode}
          css={bodyStyles(theme, bodyMode)}
        >
          {children}
        </div>

        {footer ? <footer css={footerStyles(theme)}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
});
