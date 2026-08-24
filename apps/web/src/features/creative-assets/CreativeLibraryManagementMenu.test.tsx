// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { CreativeLibraryManagementMenu } from './CreativeLibraryManagementMenu';
import { createCreativeAssetRepository } from './repository';

describe('CreativeLibraryManagementMenu', () => {
  afterEach(cleanup);

  it('keeps whole-library portability behind the overflow and restores focus after closing', async () => {
    const repository = createCreativeAssetRepository({ storage: null });
    const user = userEvent.setup();
    render(
      <StudioDesignProvider>
        <CreativeLibraryManagementMenu
          repository={repository}
          store={repository.getSnapshot().store}
          mirror="cloud"
        />
      </StudioDesignProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Creative library actions' });
    expect(screen.queryByRole('button', { name: 'Export library' })).not.toBeInTheDocument();
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: /Export or import library/u }));

    const dialog = await screen.findByRole('dialog', { name: 'Library data' });
    expect(within(dialog).getByRole('button', { name: 'Export library' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: 'Import library' })).toBeVisible();
    expect(within(dialog).getByText(/available wherever you sign in/u)).toBeVisible();

    await user.click(within(dialog).getByRole('button', { name: 'Close library data' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Library data' })).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
