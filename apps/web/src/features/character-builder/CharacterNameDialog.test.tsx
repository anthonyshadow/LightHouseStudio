// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { CharacterNameDialog } from './CharacterNameDialog';

afterEach(cleanup);

const renderDialog = (options: Partial<ComponentProps<typeof CharacterNameDialog>> = {}) => {
  const onCancel = vi.fn();
  const onSubmit = vi.fn();
  render(
    <StudioDesignProvider>
      <CharacterNameDialog
        open
        initialName="Documentary Presenter 01"
        onCancel={onCancel}
        onSubmit={onSubmit}
        {...options}
      />
    </StudioDesignProvider>,
  );
  return { onCancel, onSubmit };
};

describe('CharacterNameDialog', () => {
  it('requires an intentional useful name and submits its normalized value', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog();
    const name = screen.getByRole('textbox', { name: /Character name/u });

    await user.clear(name);
    await user.click(screen.getByRole('button', { name: 'Save Character' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a useful character name.');
    expect(onSubmit).not.toHaveBeenCalled();

    await user.type(name, '  Field   Coach  ');
    await user.click(screen.getByRole('button', { name: 'Save Character' }));
    expect(onSubmit).toHaveBeenCalledWith('Field Coach');
  });

  it('uses image-only copy and freezes the original name while resuming a journaled save', () => {
    const { onSubmit } = renderDialog({
      imageOnly: true,
      locked: true,
      initialName: 'Portrait Coach',
    });

    expect(screen.getByRole('textbox', { name: /Character name/u })).toBeDisabled();
    screen.getByRole('button', { name: 'Resume Save' }).click();
    expect(onSubmit).toHaveBeenCalledWith('Portrait Coach');
  });

  it('distinguishes prompt-only save from retained local reference bytes', () => {
    const view = renderDialog();
    expect(screen.getByText(/prompt-only save.*does not contact an image provider/i)).toBeVisible();

    view.onCancel.mockClear();
    cleanup();
    renderDialog({ retainsReferenceAsset: true });

    expect(screen.getByText('Local reference retention')).toBeVisible();
    expect(
      screen.getByText(
        /deleting the character later removes its links, not the stored image bytes/i,
      ),
    ).toBeVisible();
    expect(
      screen.getByText(/whole-environment retirement deletes those local bytes/i),
    ).toBeVisible();
  });
});
