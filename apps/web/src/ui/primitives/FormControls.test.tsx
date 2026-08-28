// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioDesignProvider } from '../StudioDesignProvider';
import { TextAreaField, TextField } from './FormControls';

afterEach(cleanup);

const show = (node: React.ReactElement) =>
  render(<StudioDesignProvider>{node}</StudioDesignProvider>);

describe('form controls and browser suggestions', () => {
  it('offers no suggestions on a field that has not asked for them', () => {
    show(<TextField label="Video title" />);

    const field = screen.getByRole('textbox', { name: 'Video title' });
    expect(field).toHaveAttribute('autocomplete', 'off');
    // The password managers that fill on their own heuristics read these instead.
    expect(field).toHaveAttribute('data-1p-ignore');
    expect(field).toHaveAttribute('data-lpignore', 'true');
  });

  it('offers none on a multi-line field either', () => {
    show(<TextAreaField label="Direction" />);

    expect(screen.getByRole('textbox', { name: 'Direction' })).toHaveAttribute(
      'autocomplete',
      'off',
    );
  });

  it('defers to a field that states what it wants, which is how signing in keeps its fill', () => {
    show(<TextField label="Login" autoComplete="username" />);

    expect(screen.getByRole('textbox', { name: 'Login' })).toHaveAttribute(
      'autocomplete',
      'username',
    );
  });
});
