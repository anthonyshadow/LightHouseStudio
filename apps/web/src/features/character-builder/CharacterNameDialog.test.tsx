// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
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
    expect(onSubmit).toHaveBeenCalledWith('Field Coach', 'default');
  });

  it('offers what to save only when an uploaded image gives the choice meaning', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderDialog({
      canSaveUploadedImageOnly: true,
      imageOnlyInitialName: 'Uploaded Character 01',
    });

    const choice = screen.getByRole('group', { name: 'What to save' });
    expect(screen.getByRole('textbox', { name: /Character name/u })).toHaveValue(
      'Documentary Presenter 01',
    );
    expect(screen.getByText(/Keeps your description and its generated portrait/i)).toBeVisible();

    await user.click(within(choice).getByRole('button', { name: 'Uploaded image only' }));
    expect(screen.getByText(/Keeps the image you uploaded and nothing else/i)).toBeVisible();
    // The suggestion follows the choice, because it describes what is about to be saved.
    expect(screen.getByRole('textbox', { name: /Character name/u })).toHaveValue(
      'Uploaded Character 01',
    );

    await user.click(screen.getByRole('button', { name: 'Save Character' }));
    expect(onSubmit).toHaveBeenCalledWith('Uploaded Character 01', 'image-only');
  });

  it('does not offer a choice when there is no uploaded image behind it', () => {
    renderDialog();
    expect(screen.queryByRole('group', { name: 'What to save' })).not.toBeInTheDocument();
  });

  it('freezes the original name and the mode while resuming a journaled save', () => {
    const { onSubmit } = renderDialog({
      canSaveUploadedImageOnly: true,
      locked: true,
      initialName: 'Portrait Coach',
    });

    expect(screen.getByRole('textbox', { name: /Character name/u })).toBeDisabled();
    expect(screen.queryByRole('group', { name: 'What to save' })).not.toBeInTheDocument();
    screen.getByRole('button', { name: 'Resume Save' }).click();
    expect(onSubmit).toHaveBeenCalledWith('Portrait Coach', 'default');
  });

  it('distinguishes prompt-only save from retained local reference bytes', () => {
    const view = renderDialog();
    expect(screen.getByText(/prompt-only save.*does not contact an image provider/i)).toBeVisible();

    view.onCancel.mockClear();
    cleanup();
    renderDialog({ retainsReferenceAsset: true });

    expect(screen.getByText('Local reference retention')).toBeVisible();
    expect(
      screen.getByText(/deleting the character later removes its links, not the stored image/i),
    ).toBeVisible();
    expect(screen.getByText(/retiring the whole environment deletes those files/i)).toBeVisible();
  });
});
