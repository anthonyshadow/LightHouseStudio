import { useTheme } from '@emotion/react';
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
import type {
  OverlayPanelBodyMode,
  OverlayPanelInitialFocus,
  OverlayPanelPlacement,
  OverlayPanelSize,
  OverlayPhase,
} from './OverlayPanel.types';
import {
  backdropStyles,
  bodyStyles,
  descriptionStyles,
  footerStyles,
  headerStyles,
  headingStyles,
  panelStyles,
} from './OverlayPanel.styles';
import {
  canRestoreFocus,
  focusTopmostDialog,
  getFocusableElements,
  isFocusableElement,
  isTopmostOverlay,
  registerOverlay,
} from './overlayStack';

export type {
  OverlayPanelBodyMode,
  OverlayPanelInitialFocus,
  OverlayPanelPlacement,
  OverlayPanelSize,
} from './OverlayPanel.types';

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

const OVERLAY_EXIT_DURATION_MS = 220;

const prefersReducedMotion = () =>
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

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
