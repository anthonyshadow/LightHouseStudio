// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../ui';
import { StudioHeader } from './StudioHeader';

const availability = {
  decart: true,
  elevenLabs: false,
  elevenLabsModel: null,
};

const browser = {
  secureContext: true,
  mediaDevices: true,
  mediaRecorder: true,
  webAudio: true,
  offlineAudio: true,
};

const accountProps = {
  user: {
    id: '2d7914b2-f912-4b96-b17d-54100a2ffea3',
    login: 'demo@lightframe.local',
    username: 'demo',
    email: 'demo@lightframe.local',
    displayName: 'Demo Creator',
    avatarUrl: null,
    planId: 'free' as const,
    role: 'user' as const,
    status: 'active' as const,
    createdAt: '2026-08-05T12:00:00.000Z',
    updatedAt: '2026-08-05T12:00:00.000Z',
    lastLoginAt: '2026-08-05T12:00:00.000Z',
  },
  onOpenVideos: vi.fn(),
  onOpenCharacters: vi.fn(),
  onOpenOutfits: vi.fn(),
  onLogout: vi.fn(),
};

afterEach(cleanup);

describe('StudioHeader', () => {
  it('places an accessible unselect action next to the selected AI recipe', async () => {
    const user = userEvent.setup();
    const onClearCharacter = vi.fn();
    render(
      <StudioDesignProvider>
        <StudioHeader
          {...accountProps}
          availability={availability}
          browser={browser}
          capabilityState="ready"
          characterSelectorRef={{ current: null }}
          selectorLabel="Select AI"
          activeCharacterName="Business man"
          onOpenCharacterSelector={vi.fn()}
          onClearCharacter={onClearCharacter}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Unselect AI: Business man' }));
    expect(onClearCharacter).toHaveBeenCalledOnce();
  });

  it('hides the unselect action when no character is selected', () => {
    render(
      <StudioDesignProvider>
        <StudioHeader
          {...accountProps}
          availability={availability}
          browser={browser}
          capabilityState="ready"
          characterSelectorRef={{ current: null }}
          selectorLabel="Select AI"
          onOpenCharacterSelector={vi.fn()}
          onClearCharacter={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: /No AI selected/u })).toHaveTextContent('Select AI');
    expect(screen.queryByRole('button', { name: /Unselect AI/u })).not.toBeInTheDocument();
  });

  it('omits the header selector for the desktop rail layout', () => {
    render(
      <StudioDesignProvider>
        <StudioHeader
          {...accountProps}
          availability={availability}
          browser={browser}
          capabilityState="ready"
          characterSelectorRef={{ current: null }}
          showAiSelector={false}
          selectorLabel="Select AI"
          onOpenCharacterSelector={vi.fn()}
          onClearCharacter={vi.fn()}
        />
      </StudioDesignProvider>,
    );
    expect(screen.queryByRole('button', { name: /Select AI options/u })).not.toBeInTheDocument();
  });
});
