// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrowserCapabilities, ProviderAvailability } from '../features/media-session';
import { StudioDesignProvider } from '../ui';
import { StudioHeader } from './StudioHeader';

afterEach(cleanup);

const browser: BrowserCapabilities = {
  secureContext: true,
  mediaDevices: true,
  mediaRecorder: true,
  webAudio: true,
  offlineAudio: true,
};

const availability = (overrides: Partial<ProviderAvailability> = {}): ProviderAvailability => ({
  decart: true,
  elevenLabs: true,
  elevenLabsModel: 'eleven_multilingual_sts_v2',
  ...overrides,
});

const renderHeader = (
  providerAvailability: ProviderAvailability,
  capabilityState: 'loading' | 'ready' | 'error' = 'ready',
  browserCapabilities: BrowserCapabilities = browser,
) =>
  render(
    <StudioDesignProvider>
      <StudioHeader
        availability={providerAvailability}
        browser={browserCapabilities}
        capabilityState={capabilityState}
        characterSelectorRef={createRef<HTMLButtonElement>()}
        onOpenCharacterSelector={vi.fn()}
      />
    </StudioDesignProvider>,
  );

describe('StudioHeader capability truth', () => {
  it('describes configuration as available to try without claiming provider health', () => {
    renderHeader(availability());

    const summary = screen.getByLabelText('Integration availability');
    expect(summary).toHaveTextContent('Studio available to try');
    expect(summary).toHaveTextContent('Local capture available');
    expect(summary).toHaveTextContent('AI video configured');
    expect(summary).toHaveTextContent('Voice cloud configured');
    expect(summary).not.toHaveTextContent(/systems ready|provider healthy|entitled/i);
  });

  it('keeps the no-key local-only path explicit and independently limited', () => {
    renderHeader(availability({ decart: false, elevenLabs: false, elevenLabsModel: null }));

    const summary = screen.getByLabelText('Integration availability');
    expect(summary).toHaveTextContent('Studio limited');
    expect(summary).toHaveTextContent('Local capture available');
    expect(summary).toHaveTextContent('AI video not configured');
    expect(summary).toHaveTextContent('Voice cloud not configured (optional)');
  });

  it('distinguishes an unreachable configuration check from provider health', () => {
    renderHeader(availability({ decart: false, elevenLabs: false }), 'error');

    const summary = screen.getByLabelText('Integration availability');
    expect(summary).toHaveTextContent('Integration status unavailable');
    expect(summary).toHaveTextContent('AI video configuration unavailable');
    expect(summary).toHaveTextContent('Voice cloud configuration unavailable');
  });
});
