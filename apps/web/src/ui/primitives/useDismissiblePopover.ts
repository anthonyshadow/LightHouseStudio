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
      // A popover opened inside a panel is the innermost layer, so it takes Escape first and says
      // so. Without this the panel's own handler — registered earlier, and therefore ahead in the
      // bubble phase — would close the whole panel instead of just this menu.
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('pointerdown', closeOutside, true);
    document.addEventListener('keydown', closeWithEscape, true);
    return () => {
      document.removeEventListener('pointerdown', closeOutside, true);
      document.removeEventListener('keydown', closeWithEscape, true);
    };
  }, [onOpenChange, open, rootRef, triggerRef]);
};
