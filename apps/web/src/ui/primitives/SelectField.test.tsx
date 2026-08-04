// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../StudioDesignProvider';
import { SelectField } from './SelectField';

afterEach(cleanup);

const options = [
  { value: 'alpha', label: 'Alpha', description: 'First choice' },
  { value: 'beta', label: 'Beta', description: 'Second choice' },
  { value: 'gamma', label: 'Gamma', disabled: true },
] as const;

describe('SelectField', () => {
  it('opens a themed listbox and commits a pointer selection', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <StudioDesignProvider>
        <SelectField
          label="Camera profile"
          value="alpha"
          options={options}
          hint="Used for the next preview."
          onValueChange={onValueChange}
        />
      </StudioDesignProvider>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Camera profile' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveTextContent('Alpha');
    expect(trigger).toHaveStyle({ minHeight: '2.85rem' });

    await user.click(trigger);
    const listbox = screen.getByRole('listbox', { name: 'Camera profile' });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(within(listbox).getByRole('option', { name: /Alpha/u })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(within(listbox).getByRole('option', { name: /Gamma/u })).toBeDisabled();

    await user.click(within(listbox).getByRole('option', { name: /Beta/u }));
    expect(onValueChange).toHaveBeenCalledWith('beta');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('supports arrows, typeahead, selection, and focus-restoring Escape', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <StudioDesignProvider>
        <SelectField
          label="Camera profile"
          value="alpha"
          options={options}
          onValueChange={onValueChange}
        />
      </StudioDesignProvider>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Camera profile' });
    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByRole('option', { name: /Alpha/u })).toHaveFocus());
    await user.keyboard('b');
    await waitFor(() => expect(screen.getByRole('option', { name: /Beta/u })).toHaveFocus());
    await user.keyboard('{Enter}');
    expect(onValueChange).toHaveBeenCalledWith('beta');
    await waitFor(() => expect(trigger).toHaveFocus());

    trigger.focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() => expect(screen.getByRole('option', { name: /Alpha/u })).toHaveFocus());
    expect(screen.getByRole('listbox', { name: 'Camera profile' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('exposes validation state and blocks disabled controls', () => {
    render(
      <StudioDesignProvider>
        <SelectField
          label="Output resolution"
          value=""
          options={[{ value: '', label: 'Choose resolution' }]}
          error="Choose an output resolution."
          required
          disabled
          onValueChange={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    const trigger = screen.getByRole('combobox', { name: 'Output resolution' });
    expect(trigger).toBeDisabled();
    expect(trigger).toHaveAttribute('aria-invalid', 'true');
    expect(trigger).toHaveAttribute('aria-required', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Choose an output resolution.');
  });
});
