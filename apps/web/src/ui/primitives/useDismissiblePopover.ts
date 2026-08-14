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
      if (event.key !== 'Escape') return;
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
