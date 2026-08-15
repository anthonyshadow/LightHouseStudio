// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { LiveBetaRouteSurface } from './LiveBetaRouteSurface';

describe('LiveBetaRouteSurface', () => {
  afterEach(cleanup);

  it('explains a disabled deep link without blocking standard creation', async () => {
    const user = userEvent.setup();
    const onOpenStudio = vi.fn();
    render(
      <StudioDesignProvider>
        <LiveBetaRouteSurface
          capabilityState="ready"
          betaEnabled={false}
          providerConfigured
          onOpenStudio={onOpenStudio}
          onOpenDashboard={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Live AI is unavailable' })).toBeVisible();
    expect(screen.getByText(/not enabled on this Lightframe installation/u)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create without Live AI' }));
    expect(onOpenStudio).toHaveBeenCalledOnce();
  });

  it('keeps the standard-create action disabled while capability state is loading', () => {
    render(
      <StudioDesignProvider>
        <LiveBetaRouteSurface
          capabilityState="loading"
          betaEnabled={false}
          providerConfigured={false}
          onOpenStudio={vi.fn()}
          onOpenDashboard={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('status')).toHaveTextContent('Checking Live AI Beta availability');
    expect(screen.getByRole('button', { name: 'Create without Live AI' })).toBeDisabled();
  });
});
