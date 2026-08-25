import { useTheme } from '@emotion/react';
import { useId, useRef, useState } from 'react';
import { AppIcon } from './AppIcon';
import { Button } from './Button';
import { actionMenuPopoverStyles, actionMenuStyles } from './ActionMenu.styles';
import { useDismissiblePopover } from './useDismissiblePopover';
import { useMenuKeyboardNavigation } from './useMenuKeyboardNavigation';

export type ActionMenuItem = Readonly<{
  /** Stable key for the rendered row. */
  id: string;
  label: string;
  /**
   * Receives the menu trigger. Selecting an item closes the menu, which unmounts the item, so a
   * dialog opened from here must return focus to the trigger — the only element that survives.
   */
  onSelect: (trigger: HTMLButtonElement | null) => void;
  /** Destructive actions are marked here rather than promoted into a page's default action row. */
  danger?: boolean;
  disabled?: boolean;
  /**
   * A second line under the label, announced as the item's description: why a disabled item is
   * unavailable, or what an enabled one will do. The accessible name stays the label alone.
   */
  description?: string;
}>;

/**
 * The product's one overflow menu: Escape and outside-click dismissal from `useDismissiblePopover`,
 * roving focus from `useMenuKeyboardNavigation`, and real `menu` / `menuitem` semantics.
 *
 * A disabled item stays focusable via `aria-disabled` rather than the `disabled` attribute: a menu
 * whose items drop out of the focus order cannot be walked with the arrow keys, and the reason the
 * item is unavailable would never be announced.
 */
export const ActionMenu = ({
  label,
  items,
  placement = 'below',
}: {
  /** Accessible name for both the trigger and the menu, e.g. `More actions for Morning take`. */
  readonly label: string;
  readonly items: readonly ActionMenuItem[];
  readonly placement?: 'above' | 'below';
}) => {
  const theme = useTheme();
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissiblePopover({ open, onOpenChange: setOpen, rootRef, triggerRef });
  const handleMenuKeyDown = useMenuKeyboardNavigation(menuRef, open);

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} css={actionMenuStyles(theme)}>
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        <AppIcon name="more" />
      </Button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          tabIndex={-1}
          aria-label={label}
          css={actionMenuPopoverStyles(theme, placement)}
          onKeyDown={handleMenuKeyDown}
        >
          {items.map((item) => {
            const disabled = item.disabled ?? false;
            const description = item.description;
            const descriptionId =
              description === undefined ? undefined : `${menuId}-${item.id}-description`;
            return (
              <Button
                key={item.id}
                type="button"
                role="menuitem"
                variant="quiet"
                {...(item.danger ? { 'data-danger': '' } : {})}
                aria-disabled={disabled}
                {...(descriptionId === undefined
                  ? {}
                  : { 'aria-label': item.label, 'aria-describedby': descriptionId })}
                onClick={() => {
                  if (disabled) return;
                  const trigger = triggerRef.current;
                  setOpen(false);
                  item.onSelect(trigger);
                }}
              >
                <span>{item.label}</span>
                {descriptionId === undefined ? null : (
                  <span data-action-menu-description id={descriptionId}>
                    {description}
                  </span>
                )}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
};
