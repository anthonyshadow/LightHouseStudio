// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioDesignProvider } from '../StudioDesignProvider';
import { Skeleton } from './Skeleton';

afterEach(() => {
  cleanup();
});

describe('Skeleton', () => {
  it('stays out of the accessibility tree so the section keeps one loading announcement', () => {
    const { container } = render(
      <StudioDesignProvider>
        <section aria-label="Recent work">
          <span role="status">Loading recent work…</span>
          <Skeleton variant="row" />
          <Skeleton variant="row" />
        </section>
      </StudioDesignProvider>,
    );

    expect(container.querySelectorAll('[data-skeleton="row"]')).toHaveLength(2);
    for (const node of container.querySelectorAll('[data-skeleton]')) {
      expect(node.getAttribute('aria-hidden')).toBe('true');
    }
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('composes a poster and two copy lines for the row and card shapes only', () => {
    const { container } = render(
      <StudioDesignProvider>
        <Skeleton variant="card" />
        <Skeleton variant="line" width="42%" />
      </StudioDesignProvider>,
    );

    const card = container.querySelector('[data-skeleton="card"]');
    expect(card?.querySelector('[data-skeleton-poster]')).not.toBeNull();
    expect(card?.querySelectorAll('[data-skeleton-line]')).toHaveLength(2);

    const line = container.querySelector('[data-skeleton="line"]');
    expect(line?.children).toHaveLength(0);
    expect(line).toHaveStyle({ width: '42%' });
  });
});
