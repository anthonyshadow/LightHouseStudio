import { keyframes, useTheme, type CSSObject, type Theme } from '@emotion/react';
import { forwardRef, useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './IconButton';

export type OverlayPanelPlacement = 'right' | 'bottom' | 'fullscreen';
export type OverlayPanelSize = 'standard' | 'wide';

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
  closeOnBackdrop?: boolean;
  initialFocusRef?: RefObject<HTMLElement | null>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

const openOverlayIds: string[] = [];
let bodyLockCount = 0;
let unlockedBodyOverflow = '';

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

const getFocusableElements = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(
    (element) =>
      element.getAttribute('aria-hidden') !== 'true' &&
      !element.hidden &&
      !(element instanceof HTMLInputElement && element.type === 'hidden'),
  );

const fadeIn = keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

const slideInRight = keyframes({
  from: { opacity: 0, transform: 'translateX(1rem)' },
  to: { opacity: 1, transform: 'translateX(0)' },
});

const slideInBottom = keyframes({
  from: { opacity: 0, transform: 'translateY(1rem)' },
  to: { opacity: 1, transform: 'translateY(0)' },
});

const backdropStyles = (theme: Theme, placement: OverlayPanelPlacement): CSSObject => ({
  position: 'fixed',
  inset: 0,
  zIndex: 1000,
  minWidth: 0,
  minHeight: 0,
  display: 'flex',
  alignItems: placement === 'right' ? 'stretch' : 'flex-end',
  justifyContent: 'flex-end',
  overflow: 'hidden',
  background: theme.colors.scrim,
  animation: `${fadeIn} ${theme.motion.standard} both`,
});

const panelWidth = (placement: OverlayPanelPlacement, size: OverlayPanelSize): string => {
  if (placement !== 'right') return '100%';
  return size === 'wide' ? 'min(50rem, calc(100vw - 1rem))' : 'min(30rem, calc(100vw - 1rem))';
};

const panelEntrance = (placement: OverlayPanelPlacement) => {
  switch (placement) {
    case 'right':
      return slideInRight;
    case 'bottom':
      return slideInBottom;
    case 'fullscreen':
      return fadeIn;
  }
};

const panelStyles = (
  theme: Theme,
  placement: OverlayPanelPlacement,
  size: OverlayPanelSize,
): CSSObject => ({
  width: panelWidth(placement, size),
  height: placement === 'right' || placement === 'fullscreen' ? '100%' : 'auto',
  maxWidth: '100%',
  maxHeight: placement === 'bottom' ? 'min(90dvh, 52rem)' : '100dvh',
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
  animation: `${panelEntrance(placement)} ${theme.motion.standard} both`,
  willChange: 'transform, opacity',
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
  padding: `max(${theme.space.md}, env(safe-area-inset-top)) ${theme.space.md} ${theme.space.md}`,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  background: theme.colors.overlaySurface,
  '@media (max-height: 36rem)': {
    alignItems: 'center',
    padding: `max(${theme.space.sm}, env(safe-area-inset-top)) ${theme.space.sm} ${theme.space.sm}`,
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

const bodyStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  padding: `${theme.space.md} ${theme.space.md} max(${theme.space.md}, env(safe-area-inset-bottom))`,
  overflow: 'auto',
  overscrollBehavior: 'contain',
  scrollbarGutter: 'stable',
});

const footerStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  padding: `${theme.space.md} ${theme.space.md} max(${theme.space.md}, env(safe-area-inset-bottom))`,
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
    closeOnBackdrop = true,
    initialFocusRef,
    returnFocusRef,
  },
  forwardedRef,
) {
  const theme = useTheme();
  const reactId = useId();
  const overlayId = `overlay-${reactId}`;
  const titleId = `${reactId}-title`;
  const descriptionId = `${reactId}-description`;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const opener =
      returnFocusRef?.current ??
      (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    openOverlayIds.push(overlayId);

    if (bodyLockCount === 0) {
      unlockedBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    bodyLockCount += 1;

    const isTopmost = () => openOverlayIds.at(-1) === overlayId;

    queueMicrotask(() => {
      const panel = panelRef.current;
      if (!panel || !isTopmost()) return;

      const preferredTarget = initialFocusRef?.current;
      const target =
        preferredTarget && panel.contains(preferredTarget)
          ? preferredTarget
          : (getFocusableElements(panel)[0] ?? panel);
      target.focus();
    });

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel || !isTopmost()) return;

      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
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
      const stackIndex = openOverlayIds.lastIndexOf(overlayId);
      if (stackIndex >= 0) openOverlayIds.splice(stackIndex, 1);

      bodyLockCount = Math.max(0, bodyLockCount - 1);
      if (bodyLockCount === 0) document.body.style.overflow = unlockedBodyOverflow;

      queueMicrotask(() => {
        if (opener?.isConnected) opener.focus();
      });
    };
  }, [initialFocusRef, open, overlayId, returnFocusRef]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      role="presentation"
      css={backdropStyles(theme, placement)}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onCloseRef.current();
      }}
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
        css={panelStyles(theme, placement, size)}
      >
        <header css={headerStyles(theme)}>
          <div css={{ minWidth: 0 }}>
            <h2 id={titleId} css={headingStyles(theme)}>
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} css={descriptionStyles(theme)}>
                {description}
              </p>
            ) : null}
          </div>
          <IconButton label={closeLabel} variant="quiet" onClick={() => onCloseRef.current()}>
            <span aria-hidden="true" css={{ fontSize: '1.5rem', lineHeight: 1 }}>
              ×
            </span>
          </IconButton>
        </header>

        <div data-scroll-region="overlay-panel" css={bodyStyles(theme)}>
          {children}
        </div>

        {footer ? <footer css={footerStyles(theme)}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
});
