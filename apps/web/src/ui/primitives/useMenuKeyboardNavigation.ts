import { useCallback, useEffect, type KeyboardEvent, type RefObject } from 'react';

/**
 * Roving focus for a `role="menu"` popover: ArrowUp/ArrowDown wrap, Home/End jump, and the first
 * menu item takes focus when the menu opens. One owner, so a keyboard-behaviour fix (wrapping,
 * typeahead, disabled skipping) lands in every menu at once.
 */
export const useMenuKeyboardNavigation = (
  menuRef: RefObject<HTMLElement | null>,
  open: boolean,
) => {
  useEffect(() => {
    if (!open) return;
    window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
  }, [menuRef, open]);

  return useCallback(
    (event: KeyboardEvent<HTMLElement>) => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      const items = [
        ...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
      ];
      if (items.length === 0) return;
      event.preventDefault();
      const current = items.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : event.key === 'ArrowDown'
              ? (current + 1 + items.length) % items.length
              : (current - 1 + items.length) % items.length;
      items[next]?.focus();
    },
    [menuRef],
  );
};
