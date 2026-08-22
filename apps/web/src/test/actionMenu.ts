import { screen, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

/**
 * Opens an `ActionMenu` and picks one item.
 *
 * Returns the trigger, which is the element focus comes back to once a dialog opened from the menu
 * closes — the item itself is unmounted the moment the menu shuts, so it is never the return
 * target. One owner, so a change to the menu's markup or its accessible name is a single edit.
 */
export const chooseMenuAction = async (
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  action: string,
  container?: HTMLElement,
): Promise<HTMLElement> => {
  const queries = container === undefined ? screen : within(container);
  const trigger = await queries.findByLabelText(`More actions for ${label}`);
  await user.click(trigger);
  await user.click(await queries.findByRole('menuitem', { name: action }));
  return trigger;
};
