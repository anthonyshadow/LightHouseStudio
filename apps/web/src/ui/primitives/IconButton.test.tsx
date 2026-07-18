// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioDesignProvider } from '../StudioDesignProvider';
import { IconButton } from './IconButton';

afterEach(cleanup);

describe('IconButton', () => {
  it('requires a visible accessible name while retaining a 44px target', () => {
    render(
      <StudioDesignProvider>
        <IconButton label="Open settings">
          <span aria-hidden="true">S</span>
        </IconButton>
      </StudioDesignProvider>,
    );

    const button = screen.getByRole('button', { name: 'Open settings' });
    expect(button).toHaveStyle({
      minInlineSize: '2.75rem',
      minBlockSize: '2.75rem',
    });
  });
});
