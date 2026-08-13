// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../ui';
import { AIExperienceChooser } from './AIExperienceChooser';

afterEach(cleanup);

describe('AIExperienceChooser Project gate', () => {
  it('keeps configuration available but removes every Project provider Start action', () => {
    const onStartCharacter = vi.fn();
    const onStartVirtualTryOn = vi.fn();
    render(
      <StudioDesignProvider>
        <AIExperienceChooser
          open
          decartAvailable
          capabilityState="ready"
          activeCharacterName="Ari"
          characterReady
          virtualTryOnReady
          providerStartBlockedReason="Project provider processing is unavailable until recoverable Project processing is enabled."
          onClose={vi.fn()}
          onStartCharacter={onStartCharacter}
          onCreateCharacter={vi.fn()}
          onChooseSavedCharacter={vi.fn()}
          onStartVirtualTryOn={onStartVirtualTryOn}
          onConfigureVirtualTryOn={vi.fn()}
          onChooseSavedVirtualTryOn={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Start with Ari' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Virtual Try-On' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Character' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Configure Virtual Try-On' })).toBeEnabled();
    expect(
      screen.getAllByText(
        'Project provider processing is unavailable until recoverable Project processing is enabled.',
      ),
    ).toHaveLength(2);
    expect(onStartCharacter).not.toHaveBeenCalled();
    expect(onStartVirtualTryOn).not.toHaveBeenCalled();
  });
});
