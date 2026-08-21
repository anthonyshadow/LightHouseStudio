// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioDesignProvider } from '../ui';
import { HowLightframeWorksPanel } from './HowLightframeWorksPanel';

const PanelHarness = () => {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <StudioDesignProvider>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        Help
      </button>
      <HowLightframeWorksPanel
        open={open}
        onClose={() => setOpen(false)}
        returnFocusRef={triggerRef}
      />
    </StudioDesignProvider>
  );
};

afterEach(cleanup);

describe('HowLightframeWorksPanel', () => {
  it('answers when each concept is worth using, with a concrete example apiece', async () => {
    const user = userEvent.setup();
    render(<PanelHarness />);

    await user.click(screen.getByRole('button', { name: 'Help' }));
    const panel = await screen.findByRole('dialog', { name: 'How Lightframe works' });

    for (const concept of ['Videos', 'Projects', 'Campaigns', 'Characters', 'Outfits', 'Voices']) {
      expect(within(panel).getByText(concept)).toBeVisible();
    }
    // "When would I use this", not a definition — spot-check the phrasing carries a condition.
    expect(
      within(panel).getByText(/Use a Project when you will come back to the same video/u),
    ).toBeVisible();
    expect(
      within(panel).getByText(/Use a Campaign when several Projects belong to one effort/u),
    ).toBeVisible();
    expect(within(panel).getAllByText(/^For example: /u)).toHaveLength(6);
  });

  it('closes back to its trigger', async () => {
    const user = userEvent.setup();
    render(<PanelHarness />);
    const trigger = screen.getByRole('button', { name: 'Help' });

    await user.click(trigger);
    const panel = await screen.findByRole('dialog', { name: 'How Lightframe works' });
    await user.click(within(panel).getByRole('button', { name: 'Close panel' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
