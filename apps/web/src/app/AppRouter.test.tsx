// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useLayoutEffect, useRef } from 'react';
import { createMemoryRouter, RouterProvider, type InitialEntry } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../ui';
import type { StudioAppProps } from '../studio/StudioApp';

const appHarness = vi.hoisted(() => ({
  renderCount: 0,
  latestProps: null as StudioAppProps | null,
}));

vi.mock('../studio/StudioApp', () => ({
  StudioApp: (props: StudioAppProps) => {
    appHarness.renderCount += 1;
    appHarness.latestProps = props;
    const mainRef = useRef<HTMLElement>(null);
    useLayoutEffect(() => {
      if (props.focusMainOnMount) mainRef.current?.focus();
    }, [props.focusMainOnMount]);
    return (
      <main ref={mainRef} id="studio-main" tabIndex={-1}>
        Studio route
      </main>
    );
  },
}));

import { RoutedApplication } from './AppRouter';

const renderApplication = (initialEntry: InitialEntry = '/') => {
  const router = createMemoryRouter([{ path: '*', element: <RoutedApplication /> }], {
    initialEntries: [initialEntry],
  });
  const view = render(
    <StudioDesignProvider>
      <RouterProvider router={router} />
    </StudioDesignProvider>,
  );
  return { ...view, router };
};

describe('AppRouter', () => {
  beforeEach(() => {
    document.title = 'Fallback title';
    document.head.querySelector('meta[name="description"]')?.remove();
    const description = document.createElement('meta');
    description.name = 'description';
    document.head.append(description);
    appHarness.renderCount = 0;
    appHarness.latestProps = null;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the semantic entry without mounting Studio and updates metadata in place', () => {
    const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    renderApplication();

    expect(screen.getByRole('heading', { name: 'Enter Lightframe Studio' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start with camera' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload existing video' })).toBeInTheDocument();
    expect(screen.queryByText('Studio route')).not.toBeInTheDocument();
    expect(appHarness.renderCount).toBe(0);
    expect(document.title).toBe('Enter Lightframe Studio');
    expect(document.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(description?.content).toContain('Enter Lightframe Studio');
  });

  it('pushes Studio from the camera entry without starting camera and hands focus to its main landmark', async () => {
    const { router } = renderApplication();
    fireEvent.click(screen.getByRole('button', { name: 'Start with camera' }));

    expect(await screen.findByText('Studio route')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/studio');
    await waitFor(() => expect(document.activeElement).toHaveAttribute('id', 'studio-main'));
    expect(appHarness.latestProps).toEqual({ focusMainOnMount: true });
    expect(document.title).toBe('Lightframe Studio');
  });

  it('passes upload intent without selecting a file or mounting Studio on the entry route', async () => {
    const { router } = renderApplication();

    fireEvent.click(screen.getByRole('button', { name: 'Upload existing video' }));

    expect(await screen.findByText('Studio route')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/studio');
    expect(appHarness.latestProps).toEqual({
      focusMainOnMount: true,
      initialIntent: 'upload',
    });
  });

  it('restores focus to the camera entry after browser Back', async () => {
    const { router } = renderApplication();
    fireEvent.click(screen.getByRole('button', { name: 'Start with camera' }));
    await screen.findByText('Studio route');

    await router.navigate(-1);

    const enter = await screen.findByRole('button', { name: 'Start with camera' });
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    await waitFor(() => expect(enter).toHaveFocus());
  });

  it('supports a direct canonical Studio entry without moving initial focus', async () => {
    renderApplication('/studio');

    expect(await screen.findByText('Studio route')).toBeInTheDocument();
    expect(appHarness.latestProps?.focusMainOnMount).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it.each([
    '/advanced',
    '/guided',
    '/projects?project=project-42',
    '/not-a-route?project=untrusted',
  ])('replaces the noncanonical path %s with the entry page', async (path) => {
    const { router } = renderApplication(path);

    expect(await screen.findByRole('button', { name: 'Start with camera' })).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe('/'));
    expect(router.state.location.search).toBe('');
    expect(appHarness.renderCount).toBe(0);
  });

  it.each(['/?new=1', '/?characterFlow=guided', '/?project=project-42'])(
    'does not activate Studio from the obsolete entry query %s',
    async (path) => {
      renderApplication(path);

      expect(await screen.findByRole('button', { name: 'Start with camera' })).toBeInTheDocument();
      expect(appHarness.renderCount).toBe(0);
    },
  );
});
