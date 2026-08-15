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

    expect(onSave).toHaveBeenCalledWith('Studio intro');
  });

  it('uses the existing generated-name fallback when the optional field is blank', async () => {
    const user = userEvent.setup();
    const { onSave } = renderDialog();

    expect(screen.getByText(/Leave blank to use.*Recorded take/u)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save to Assets' }));

    expect(onSave).toHaveBeenCalledWith(undefined);
  });

  it('cancels without saving', async () => {
    const user = userEvent.setup();
    const { onCancel, onSave } = renderDialog();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onSave).not.toHaveBeenCalled();
  });
});
