// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { StudioDesignProvider } from '../StudioDesignProvider';
import { Tabs, type TabItem } from './Tabs';

afterEach(cleanup);

type Tool = 'take' | 'voice' | 'session';

const items: readonly TabItem<Tool>[] = [
  { value: 'take', label: 'Latest take', shortLabel: 'Take', content: <p>Take panel</p> },
  { value: 'voice', label: 'Voice treatment', shortLabel: 'Voice', content: <p>Voice panel</p> },
  { value: 'session', label: 'AI session', content: <p>Session panel</p>, disabled: true },
];

const Harness = () => {
  const [value, setValue] = useState<Tool>('take');
  return <Tabs label="Workbench tools" value={value} items={items} onChange={setValue} />;
};

describe('Tabs', () => {
  it('uses controlled tab semantics and keyboard selection', async () => {
    const user = userEvent.setup();
    render(
      <StudioDesignProvider>
        <Harness />
      </StudioDesignProvider>,
    );

    const take = screen.getByRole('tab', { name: 'Latest take' });
    take.focus();
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Voice treatment' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tabpanel', { name: 'Voice treatment' })).not.toHaveAttribute('hidden');
    expect(screen.getByText('Take panel').parentElement).toHaveAttribute('hidden');
  });

  it('wraps past disabled tabs', async () => {
    const user = userEvent.setup();
    render(
      <StudioDesignProvider>
        <Harness />
      </StudioDesignProvider>,
    );

    const voice = screen.getByRole('tab', { name: 'Voice treatment' });
    await user.click(voice);
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: 'Latest take' })).toHaveFocus();
    expect(screen.getByRole('tab', { name: 'Latest take' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('supports reverse, first, and last keyboard navigation', async () => {
    const user = userEvent.setup();
    render(
      <StudioDesignProvider>
        <Harness />
      </StudioDesignProvider>,
    );

    const take = screen.getByRole('tab', { name: 'Latest take' });
    const voice = screen.getByRole('tab', { name: 'Voice treatment' });
    take.focus();

    await user.keyboard('{ArrowLeft}');
    expect(voice).toHaveFocus();
    expect(voice).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{Home}');
    expect(take).toHaveFocus();
    expect(take).toHaveAttribute('aria-selected', 'true');

    await user.keyboard('{End}');
    expect(voice).toHaveFocus();
    expect(voice).toHaveAttribute('aria-selected', 'true');
  });
});
