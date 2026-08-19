// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { SaveVideoDialog } from './SaveVideoDialog';

afterEach(cleanup);

const renderDialog = () => {
  const onCancel = vi.fn();
  const onSave = vi.fn();
  render(
    <StudioDesignProvider>
      <SaveVideoDialog
        fallbackName="Recorded take · 20260808T140000Z · ab12cd34"
        onCancel={onCancel}
        onSave={onSave}
      />
    </StudioDesignProvider>,
  );
  return { onCancel, onSave };
};

describe('SaveVideoDialog', () => {
  it('accepts a custom name and trims it before saving', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();
    const name = screen.getByRole('textbox', { name: 'Video name (optional)' });

    expect(name).toHaveFocus();
    await user.type(name, '  Studio intro  ');
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));

    expect(onSave).toHaveBeenCalledWith('Studio intro', { kind: 'auto' });
  });

  it('uses the existing generated-name fallback when the optional field is blank', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    expect(screen.getByText(/Leave blank to use.*Recorded take/u)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));

    expect(onSave).toHaveBeenCalledWith(undefined, { kind: 'auto' });
  });

  it('reports the chosen poster source and falls back to automatic when no image is attached', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'First frame' }));
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));
    expect(onSave).toHaveBeenLastCalledWith(undefined, { kind: 'first-frame' });

    await user.click(screen.getByRole('button', { name: 'Upload image' }));
    expect(screen.getByLabelText('Preview image (optional)')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));
    expect(onSave).toHaveBeenLastCalledWith(undefined, { kind: 'auto' });
  });

  it('uses an attached image as the poster source', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();
    const image = new File(['poster'], 'poster.png', { type: 'image/png' });

    await user.click(screen.getByRole('button', { name: 'Upload image' }));
    await user.upload(screen.getByLabelText('Preview image (optional)'), image);
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));

    expect(onSave).toHaveBeenCalledWith(undefined, { kind: 'image', file: image });
  });

  it('rejects an oversized image without changing the poster source', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();
    const bad = new File(['poster'], 'poster.png', { type: 'image/png' });
    Object.defineProperty(bad, 'size', { value: 11 * 1024 * 1024 });

    await user.click(screen.getByRole('button', { name: 'Upload image' }));
    await user.upload(screen.getByLabelText('Preview image (optional)'), bad);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Choose an image that is 10 MiB or smaller.',
    );
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));
    expect(onSave).toHaveBeenCalledWith(undefined, { kind: 'auto' });
  });

  it('cancels without saving', async () => {
    const user = userEvent.setup();
    const { onCancel, onSave } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });
});
