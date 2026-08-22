import { useEffect, type RefObject } from 'react';

export const useDismissiblePopover = <
  RootElement extends HTMLElement,
  TriggerElement extends HTMLElement,
>({
  open,
  onOpenChange,
  rootRef,
  triggerRef,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly rootRef: RefObject<RootElement | null>;
  readonly triggerRef: RefObject<TriggerElement | null>;
}): void => {
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        onOpenChange(false);
      }
    };
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      // A modal layered above this popover owns Escape. Its `stopPropagation` cannot reach a
      // listener on the same node, so the popover reads the isolation the modal applies instead:
      // everything behind it is marked inert. Without this one Escape would dismiss both layers,
      // and the restore below would silently fail against the inert trigger anyway.
      if (rootRef.current?.closest('[inert]') != null) return;
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('keydown', closeWithEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('keydown', closeWithEscape);
    };
  }, [onOpenChange, open, rootRef, triggerRef]);
};
