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

afterEach(cleanup);

describe('StudioHeader', () => {
  it('places an accessible unselect action next to the selected character', async () => {
    const user = userEvent.setup();
    const onClearCharacter = vi.fn();
    render(
      <StudioDesignProvider>
        <StudioHeader
          availability={availability}
          browser={browser}
          capabilityState="ready"
          characterSelectorRef={{ current: null }}
          activeCharacterName="Business man"
          onOpenCharacterSelector={vi.fn()}
          onClearCharacter={onClearCharacter}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Unselect character: Business man' }));
    expect(onClearCharacter).toHaveBeenCalledOnce();
  });

  it('hides the unselect action when no character is selected', () => {
    render(
      <StudioDesignProvider>
        <StudioHeader
          availability={availability}
          browser={browser}
          capabilityState="ready"
          characterSelectorRef={{ current: null }}
          onOpenCharacterSelector={vi.fn()}
          onClearCharacter={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: /No character selected/u })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Unselect character/u })).not.toBeInTheDocument();
  });
});
