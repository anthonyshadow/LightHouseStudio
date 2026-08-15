// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useNavigate } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../ui';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';
import { StudioExitGuard, type StudioExitGuardProps } from './StudioExitGuard';

const projectSession = (overrides: Partial<ProjectSessionPort> = {}): ProjectSessionPort => ({
  projectId: '18b120ac-1578-46e3-8c3d-42307772f391',
  phase: 'dirty',
  current: null,
  proposal: null,
  hasLocalProposal: true,
  message: null,
  propose: vi.fn(() => true),
  flush: vi.fn(() => Promise.resolve(true)),
  retry: vi.fn(() => Promise.resolve(true)),
  discard: vi.fn(() => true),
  getCurrent: vi.fn(() => null),
  acceptCurrent: vi.fn(),
  ...overrides,
});

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
          void navigate('/studio/create/live');
        }}
      >
        Open Live AI
      </button>
      <button
        type="button"
        onClick={() => {
          void navigate('/projects/730c73ca-a6af-4509-83c0-b3c18c1ee81a');
        }}
      >
        Switch Project
      </button>
      <button
        type="button"
        onClick={() => {
          void navigate('/projects/18b120ac-1578-46e3-8c3d-42307772f391');
        }}
      >
        Open Project overview
      </button>
      <StudioExitGuard {...props} />
    </main>
  );
};

const renderProjectGuard = (overrides: Partial<StudioExitGuardProps> = {}) => {
  const props: StudioExitGuardProps = {
    recordingOrFinalizing: false,
    videoRenderingActive: false,
    hasTemporaryTake: false,
    voiceProcessingActive: false,
    creativeWorkDirty: false,
    onDiscardTemporaryWork: vi.fn(),
    ...overrides,
  };
  const router = createMemoryRouter(
    [
      { path: '/projects/:projectId', element: <GuardHarness {...props} /> },
      { path: '/projects/:projectId/workspace', element: <GuardHarness {...props} /> },
      { path: '/studio/create/live', element: <h1>Live AI route</h1> },
    ],
    {
      initialEntries: ['/projects/18b120ac-1578-46e3-8c3d-42307772f391/workspace'],
    },
  );
  const view = render(
    <StudioDesignProvider>
      <RouterProvider router={router} />
    </StudioDesignProvider>,
  );
  return { ...view, props, router };
};

const renderGuard = (overrides: Partial<StudioExitGuardProps> = {}) => {
  const props: StudioExitGuardProps = {
    recordingOrFinalizing: false,
    videoRenderingActive: false,
    hasTemporaryTake: false,
    voiceProcessingActive: false,
    creativeWorkDirty: false,
    onDiscardTemporaryWork: vi.fn(),
    ...overrides,
  };
  const router = createMemoryRouter(
    [
      { path: '/', element: <h1>Entry route</h1> },
      { path: '/studio/create', element: <GuardHarness {...props} /> },
      { path: '/studio/create/live', element: <h1>Live AI route</h1> },
    ],
    { initialEntries: ['/studio/create'] },
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
    expect(router.state.location.pathname).toBe('/studio/create');
    expect(props.onDiscardTemporaryWork).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Stay in Studio' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('heading', { name: 'Finish the take before leaving' }),
      ).not.toBeInTheDocument(),
    );
    expect(router.state.location.pathname).toBe('/studio/create');
  });

  it('requires explicit worker cancellation before a route exit can discard edits', async () => {
    const { props, router } = renderGuard({
      videoRenderingActive: true,
      creativeWorkDirty: true,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Leave Studio' }));

    expect(
      await screen.findByRole('heading', { name: 'Cancel the video render before leaving' }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/studio/create');
    expect(props.onDiscardTemporaryWork).not.toHaveBeenCalled();
  });

  it.each([
    { hasTemporaryTake: true },
    { voiceProcessingActive: true },
    { creativeWorkDirty: true },
  ])('confirms and discards transient work before leaving: %#', async (unsafeState) => {
    const onDiscardTemporaryWork = vi.fn();
    renderGuard({ ...unsafeState, onDiscardTemporaryWork });
    fireEvent.click(screen.getByRole('button', { name: 'Leave Studio' }));

    expect(
      await screen.findByRole('heading', { name: 'Discard temporary work and leave?' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Discard and leave' }));

    expect(await screen.findByRole('heading', { name: 'Entry route' })).toBeInTheDocument();
    expect(onDiscardTemporaryWork).toHaveBeenCalledOnce();
  });

  it('does not block Live AI activation within the create workspace', async () => {
    renderGuard({ creativeWorkDirty: true });
    fireEvent.click(screen.getByRole('button', { name: 'Open Live AI' }));

    expect(await screen.findByRole('heading', { name: 'Live AI route' })).toBeInTheDocument();
  });

  it('names the discard boundary truthfully when temporary Studio work enters a Project', async () => {
    const { router } = renderGuard({ hasTemporaryTake: true });
    fireEvent.click(screen.getByRole('button', { name: 'Switch Project' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Discard temporary Studio work and open this Project?',
      }),
    ).toBeVisible();
    expect(router.state.location.pathname).toBe('/studio/create');
  });

  it('protects hard unloads during recording, voice work, or dirty creative work', () => {
    renderGuard({ voiceProcessingActive: true });
    const event = new Event('beforeunload', { cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('flushes a dirty Project session before switching URL-owned Project context', async () => {
    const session = projectSession();
    const { router } = renderProjectGuard({ projectSession: session });
    fireEvent.click(screen.getByRole('button', { name: 'Switch Project' }));

    await waitFor(() => expect(session.flush).toHaveBeenCalledOnce());
    await waitFor(() => expect(router.state.location.pathname).toContain('730c73ca'));
    expect(session.discard).not.toHaveBeenCalled();
  });

  it('stays on a Project conflict until the preserved proposal is retried or discarded', async () => {
    const session = projectSession({
      phase: 'conflict',
      message: 'Another session changed this Project.',
    });
    const { router } = renderProjectGuard({ projectSession: session });
    fireEvent.click(screen.getByRole('button', { name: 'Switch Project' }));

    expect(await screen.findByRole('heading', { name: 'Project save conflict' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Another session changed this Project.');
    expect(router.state.location.pathname).toContain('18b120ac');
    fireEvent.click(screen.getByRole('button', { name: 'Discard and leave' }));

    await waitFor(() => expect(router.state.location.pathname).toContain('730c73ca'));
    expect(session.discard).toHaveBeenCalledOnce();
  });

  it('reapplies a conflicted Project proposal before completing the requested switch', async () => {
    const session = projectSession({
      phase: 'conflict',
      message: 'Another session changed this Project.',
      retry: vi.fn(() => Promise.resolve(true)),
    });
    const { router } = renderProjectGuard({ projectSession: session });
    fireEvent.click(screen.getByRole('button', { name: 'Switch Project' }));

    expect(await screen.findByRole('heading', { name: 'Project save conflict' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Reapply and leave' }));

    await waitFor(() => expect(session.retry).toHaveBeenCalledOnce());
    await waitFor(() => expect(router.state.location.pathname).toContain('730c73ca'));
    expect(session.discard).not.toHaveBeenCalled();
  });

  it('keeps the preserved proposal in place when reapplying it does not save', async () => {
    const session = projectSession({
      phase: 'error',
      message: null,
      retry: vi.fn(() => Promise.resolve(false)),
    });
    const { router } = renderProjectGuard({ projectSession: session });
    fireEvent.click(screen.getByRole('button', { name: 'Switch Project' }));

    expect(await screen.findByRole('heading', { name: 'Project not saved' })).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent('Project authority is unavailable');
    fireEvent.click(screen.getByRole('button', { name: 'Reapply and leave' }));

    await waitFor(() => expect(session.retry).toHaveBeenCalledOnce());
    expect(router.state.location.pathname).toContain('18b120ac');
    expect(session.discard).not.toHaveBeenCalled();
  });

  it('shows the pending Project save and allows cancelling the attempted switch', async () => {
    let resolveFlush: (saved: boolean) => void = vi.fn();
    const session = projectSession({
      phase: 'saving',
      flush: vi.fn(
        () =>
          new Promise<boolean>((resolve) => {
            resolveFlush = resolve;
          }),
      ),
    });
    const { router } = renderProjectGuard({ projectSession: session });
    fireEvent.click(screen.getByRole('button', { name: 'Switch Project' }));

    expect(
      await screen.findByRole('heading', { name: 'Saving Project before leaving' }),
    ).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('Saving changes');
    fireEvent.click(screen.getByRole('button', { name: 'Stay in Project' }));

    await waitFor(() => expect(router.state.location.pathname).toContain('18b120ac'));
    resolveFlush(false);
    await waitFor(() => expect(session.flush).toHaveBeenCalledOnce());
  });

  it('protects hard unload while a Project proposal is pending', () => {
    renderProjectGuard({ projectSession: projectSession() });
    const event = new Event('beforeunload', { cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('allows accepted Project media to move to its overview without a discard prompt', async () => {
    const { router } = renderProjectGuard({
      hasTemporaryTake: true,
      projectSourceActivity: {
        projectId: '18b120ac-1578-46e3-8c3d-42307772f391',
        accepted: true,
        busy: false,
        abort: null,
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open Project overview' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/projects/18b120ac-1578-46e3-8c3d-42307772f391'),
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explicitly aborts cancellable source staging before switching Projects', async () => {
    const abort = vi.fn();
    const onDiscardTemporaryWork = vi.fn();
    const { router } = renderProjectGuard({
      projectSourceActivity: {
        projectId: '18b120ac-1578-46e3-8c3d-42307772f391',
        accepted: false,
        busy: true,
        abort,
      },
      onDiscardTemporaryWork,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Switch Project' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Discard temporary Project work and switch Projects?',
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toContain('18b120ac');
    fireEvent.click(screen.getByRole('button', { name: 'Discard and switch' }));

    await waitFor(() => expect(router.state.location.pathname).toContain('730c73ca'));
    expect(abort).toHaveBeenCalledOnce();
    expect(onDiscardTemporaryWork).toHaveBeenCalledOnce();
  });

  it('requires an active Project recording to reach a safe point before switching', async () => {
    const { router } = renderProjectGuard({ recordingOrFinalizing: true });
    fireEvent.click(screen.getByRole('button', { name: 'Switch Project' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Finish the take before switching Projects',
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toContain('18b120ac');
  });

  it('keeps active Project rendering or working-media adoption scoped to its Project', async () => {
    const { router } = renderProjectGuard({ videoRenderingActive: true });
    fireEvent.click(screen.getByRole('button', { name: 'Switch Project' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Finish Project media work before switching Projects',
      }),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toContain('18b120ac');
  });

  it('requires explicit discard before Project-scoped creative work can switch Projects', async () => {
    const onDiscardTemporaryWork = vi.fn();
    const { router } = renderProjectGuard({
      projectContextDirty: true,
      onDiscardTemporaryWork,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Switch Project' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Discard temporary Project work and switch Projects?',
      }),
    ).toBeVisible();
    expect(router.state.location.pathname).toContain('18b120ac');
    fireEvent.click(screen.getByRole('button', { name: 'Discard and switch' }));

    await waitFor(() => expect(router.state.location.pathname).toContain('730c73ca'));
    expect(onDiscardTemporaryWork).toHaveBeenCalledOnce();
  });

  it('protects active Project Voice work when leaving its URL-owned context', async () => {
    const { router } = renderProjectGuard({ voiceProcessingActive: true });
    fireEvent.click(screen.getByRole('button', { name: 'Open Live AI' }));

    expect(
      await screen.findByRole('heading', {
        name: 'Discard temporary Project work and leave this Project?',
      }),
    ).toBeVisible();
    expect(router.state.location.pathname).toContain('18b120ac');
  });
});
