// @vitest-environment jsdom

import type { AuthenticatedSessionResponse } from '@studio/contracts';
import { createPhaseOneEntitlements } from '@studio/domain';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  fetchDemoAuthConfig: vi.fn(),
  fetchCurrentSession: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../../adapters/api-client/authApi', () => api);

import { AuthProvider } from '../../application/auth/AuthProvider';
import { StudioDesignProvider } from '../../ui';
import { LoginDialog } from './LoginDialog';

const session: AuthenticatedSessionResponse = {
  user: {
    id: '2d7914b2-f912-4b96-b17d-54100a2ffea3',
    login: 'demo@lightframe.local',
    username: 'demo',
    email: 'demo@lightframe.local',
    displayName: 'Demo Creator',
    avatarUrl: null,
    planId: 'free',
    role: 'user',
    status: 'active',
    createdAt: '2026-08-05T12:00:00.000Z',
    updatedAt: '2026-08-05T12:00:00.000Z',
    lastLoginAt: '2026-08-05T12:00:00.000Z',
  },
  entitlements: createPhaseOneEntitlements('free', '2026-08-05T12:00:00.000Z'),
  expiresAt: '2099-08-06T12:00:00.000Z',
};

const renderDialog = (onSuccess = vi.fn(), onClose = vi.fn()) => {
  render(
    <StudioDesignProvider>
      <AuthProvider>
        <LoginDialog open onClose={onClose} onSuccess={onSuccess} />
      </AuthProvider>
    </StudioDesignProvider>,
  );
  return { onSuccess, onClose };
};

describe('LoginDialog', () => {
  beforeEach(() => {
    api.fetchDemoAuthConfig.mockReset().mockResolvedValue({
      enabled: true,
      prefill: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
    });
    api.login.mockReset();
    api.fetchCurrentSession.mockReset();
    api.logout.mockReset();
  });

  afterEach(cleanup);

  it('prefills both configured demo credentials and submits them to the backend', async () => {
    api.login.mockResolvedValue(session);
    const { onSuccess } = renderDialog();

    expect(await screen.findByLabelText(/Login/u)).toHaveValue('demo@lightframe.local');
    expect(screen.getByLabelText(/Password/u)).toHaveValue('lightframe-demo');
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() =>
      expect(api.login).toHaveBeenCalledWith(
        { login: 'demo@lightframe.local', password: 'lightframe-demo' },
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(screen.getByLabelText(/Password/u)).toHaveValue('');
  });

  it('renders a safe retryable error and re-enables the form after failed authentication', async () => {
    api.login.mockRejectedValue(new Error('private backend detail'));
    renderDialog();
    await screen.findByDisplayValue('lightframe-demo');

    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByText('Login could not be completed. Try again.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Log in' })).toBeEnabled();
  });
});
