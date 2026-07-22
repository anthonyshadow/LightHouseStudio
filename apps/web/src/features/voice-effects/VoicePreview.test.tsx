// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceVoiceItem } from '../../application/types';
import { StudioDesignProvider } from '../../ui';

const fetchVoicePreview = vi.hoisted(() => vi.fn());
vi.mock('../../adapters/api-client/voicesApi', () => ({ fetchVoicePreview }));

import { VoicePreview } from './VoicePreview';

const item: WorkspaceVoiceItem = {
  kind: 'workspace',
  voice: {
    voiceId: 'workspace-voice',
    name: 'Studio Star',
    category: null,
    description: null,
    labels: {},
    previewAvailable: true,
  },
};

beforeEach(() => {
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:voice-preview'),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const renderPreview = (onError = vi.fn()) =>
  render(
    <StudioDesignProvider>
      <VoicePreview item={item} onError={onError} />
    </StudioDesignProvider>,
  );

describe('VoicePreview', () => {
  it('contacts the provider only after an explicit action and revokes the owned URL', async () => {
    const user = userEvent.setup();
    fetchVoicePreview.mockResolvedValue(new Blob(['preview'], { type: 'audio/mpeg' }));
    const view = renderPreview();

    expect(fetchVoicePreview).not.toHaveBeenCalled();
    await user.click(
      screen.getByRole('button', { name: 'Load Studio Star preview · contacts provider' }),
    );

    expect(await screen.findByLabelText('Listen to Studio Star preview')).toHaveAttribute(
      'src',
      'blob:voice-preview',
    );
    expect(fetchVoicePreview).toHaveBeenCalledWith(item, expect.any(AbortSignal));

    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice-preview');
  });

  it('aborts a pending preview when its owner unmounts', async () => {
    const user = userEvent.setup();
    let signal: AbortSignal | null = null;
    fetchVoicePreview.mockImplementation((_item, nextSignal: AbortSignal) => {
      signal = nextSignal;
      return new Promise<Blob>(() => undefined);
    });
    const view = renderPreview();

    await user.click(
      screen.getByRole('button', { name: 'Load Studio Star preview · contacts provider' }),
    );
    await waitFor(() => expect(signal).not.toBeNull());
    view.unmount();

    const wasAborted = () => signal?.aborted ?? false;
    expect(wasAborted()).toBe(true);
  });
});
