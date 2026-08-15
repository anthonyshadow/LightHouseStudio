// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteStateTestProvider } from '../test/RemoteStateTestProvider';
import { StudioDesignProvider } from '../ui';
import { AssetCreationLauncher } from './AssetCreationLauncher';

const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';

const renderLauncher = (activeProjectId: string | null) => {
  const props = {
    open: true,
    projectId: activeProjectId,
    returnFocusRef: createRef<HTMLElement>(),
    onClose: vi.fn(),
    onCreateVideo: vi.fn(),
    onCreateCharacter: vi.fn(),
    onCreateOutfit: vi.fn(),
    onOpenVoiceLibrary: vi.fn(),
  };
  render(
    <StudioDesignProvider>
      <RemoteStateTestProvider>
        <AssetCreationLauncher {...props} />
      </RemoteStateTestProvider>
    </StudioDesignProvider>,
  );
  return props;
};

afterEach(cleanup);

describe('AssetCreationLauncher', () => {
  it('offers only supported Asset types and propagates Project context to Video creation', async () => {
    const user = userEvent.setup();
    const props = renderLauncher(projectId);
    const dialog = screen.getByRole('dialog', { name: 'Create Asset' });

    for (const label of ['Video', 'Character', 'Outfit', 'Add Voice']) {
      expect(within(dialog).getByRole('button', { name: label })).toBeVisible();
    }
    expect(within(dialog).queryByText(/Recipe/u)).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Video' }));
    await user.click(screen.getByRole('button', { name: 'Record Video' }));
    expect(props.onCreateVideo).toHaveBeenCalledWith('record', projectId);
  });

  it('opens the canonical Voice library for global creation without attaching anything', async () => {
    const user = userEvent.setup();
    const props = renderLauncher(null);

    await user.click(screen.getByRole('button', { name: 'Add Voice' }));

    expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onOpenVoiceLibrary).toHaveBeenCalledOnce();
  });
});
