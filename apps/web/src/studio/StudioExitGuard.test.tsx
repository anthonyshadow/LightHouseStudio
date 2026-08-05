// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../ui';
import { StudioExitGuard, type StudioExitGuardProps } from './StudioExitGuard';

const GuardHarness = (props: StudioExitGuardProps) => {
  const navigate = useNavigate();
  return (
    <main>
      <h1>Studio runtime</h1>
      <button
        type="button"
        onClick={() => {
          void navigate('/');
        }}
      >
        Leave Studio
      </button>
      <button
        type="button"
        onClick={() => {
          void navigate('/studio/character');
        }}
      >
        Open Studio child
      </button>
      <StudioExitGuard {...props} />
    </main>
  );
};

const renderGuard = (overrides: Partial<StudioExitGuardProps> = {}) => {
  const props: StudioExitGuardProps = {
    recordingOrFinalizing: false,
    videoRenderingActive: false,
    hasTemporaryTake: false,
    voiceProcessingActive: false,
    shelfDirty: false,
    onDiscardTemporaryWork: vi.fn(),
    ...overrides,
  };
  const router = createMemoryRouter(
    [
      { path: '/', element: <h1>Entry route</h1> },
      { path: '/studio', element: <GuardHarness {...props} /> },
      { path: '/studio/character', element: <h1>Studio child route</h1> },
    ],
    { initialEntries: ['/studio'] },
  );
  const view = render(
    <StudioDesignProvider>
      <RouterProvider router={router} />
    </StudioDesignProvider>,
  );
  return { ...view, props, router };
};

describe('StudioExitGuard', () => {
  afterEach(cleanup);

  it('allows an idle Studio exit', async () => {
    renderGuard();
    fireEvent.click(screen.getByRole('button', { name: 'Leave Studio' }));
    expect(await screen.findByRole('heading', { name: 'Entry route' })).toBeInTheDocument();
  });

  it('blocks route exit while recording or finalization is active', async () => {
    const { props, router } = renderGuard({ recordingOrFinalizing: true });
    fireEvent.click(screen.getByRole('button', { name: 'Leave Studio' }));

    expect(
      await screen.findByRole('heading', { name: 'Finish the take before leaving' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/studio');
    expect(props.onDiscardTemporaryWork).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Stay in Studio' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Finish the take before leaving' }),
      ).not.toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe('/studio');
  });

  it('requires explicit worker cancellation before a route exit can discard edits', async () => {
    const { props, router } = renderGuard({ videoRenderingActive: true, shelfDirty: true });
    fireEvent.click(screen.getByRole('button', { name: 'Leave Studio' }));

    expect(
      await screen.findByRole('heading', { name: 'Cancel the video render before leaving' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/studio');
    expect(props.onDiscardTemporaryWork).not.toHaveBeenCalled();
  });

  it.each([{ hasTemporaryTake: true }, { voiceProcessingActive: true }, { shelfDirty: true }])(
    'confirms and discards transient work before leaving: %#',
    async (unsafeState) => {
      const onDiscardTemporaryWork = vi.fn();
      renderGuard({ ...unsafeState, onDiscardTemporaryWork });
      fireEvent.click(screen.getByRole('button', { name: 'Leave Studio' }));

      expect(
        await screen.findByRole('heading', { name: 'Discard temporary work and leave?' }),
      ).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Discard and leave' }));

      expect(await screen.findByRole('heading', { name: 'Entry route' })).toBeInTheDocument();
      expect(onDiscardTemporaryWork).toHaveBeenCalledOnce();
    },
  );

  it('does not block a future transition within the Studio route subtree', async () => {
    renderGuard({ shelfDirty: true });
    fireEvent.click(screen.getByRole('button', { name: 'Open Studio child' }));

    expect(await screen.findByRole('heading', { name: 'Studio child route' })).toBeInTheDocument();
  });

  it('protects hard unloads during recording, voice work, or dirty Shelf work', () => {
    renderGuard({ voiceProcessingActive: true });
    const event = new Event('beforeunload', { cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
