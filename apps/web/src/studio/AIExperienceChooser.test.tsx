// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../ui';
import { AIExperienceChooser } from './AIExperienceChooser';

afterEach(cleanup);

const renderChooser = (overrides: Partial<ComponentProps<typeof AIExperienceChooser>> = {}) => {
  const props: ComponentProps<typeof AIExperienceChooser> = {
    open: true,
    decartAvailable: true,
    capabilityState: 'ready',
    characterReady: false,
    virtualTryOnReady: false,
    onClose: vi.fn(),
    onStartCharacter: vi.fn(),
    onCreateCharacter: vi.fn(),
    onChooseSavedCharacter: vi.fn(),
    onStartVirtualTryOn: vi.fn(),
    onConfigureVirtualTryOn: vi.fn(),
    onChooseSavedVirtualTryOn: vi.fn(),
    ...overrides,
  };
  render(
    <StudioDesignProvider>
      <AIExperienceChooser {...props} />
    </StudioDesignProvider>,
  );
  return props;
};

describe('AIExperienceChooser', () => {
  it('offers both character and Virtual Try-On preparation without stopping local media', async () => {
    const user = userEvent.setup();
    const props = renderChooser();

    expect(screen.getByRole('heading', { name: 'Character Transformation' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Virtual Try-On Beta' })).toBeVisible();
    expect(screen.getByText('Primary · Character')).toBeVisible();
    expect(screen.getByText('Secondary · Beta')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Choose Saved Character' }));
    expect(props.onChooseSavedCharacter).toHaveBeenCalledOnce();

    await user.click(screen.getByRole('button', { name: 'Configure Virtual Try-On' }));
    expect(props.onConfigureVirtualTryOn).toHaveBeenCalledOnce();
  });

  it('starts either already prepared experience through the shared start callbacks', async () => {
    const user = userEvent.setup();
    const props = renderChooser({
      activeCharacterName: 'Neon Samurai',
      characterReady: true,
      virtualTryOnReady: true,
    });

    const disclosures = screen.getAllByLabelText('Decart start disclosure');
    expect(disclosures).toHaveLength(2);
    for (const disclosure of disclosures) {
      expect(disclosure).toHaveTextContent('live camera and microphone media');
      expect(disclosure).toHaveTextContent('complete applied recipe');
      expect(disclosure).toHaveTextContent('Decart');
      expect(disclosure).toHaveTextContent('at most 300 seconds');
      expect(disclosure).toHaveTextContent('Stop AI ends usage');
    }

    await user.click(screen.getByRole('button', { name: 'Start with Neon Samurai' }));
    await user.click(screen.getByRole('button', { name: 'Start Virtual Try-On' }));

    expect(props.onStartCharacter).toHaveBeenCalledOnce();
    expect(props.onStartVirtualTryOn).toHaveBeenCalledOnce();
  });

  it('keeps preparation available while explaining why provider Start is unavailable', () => {
    renderChooser({
      decartAvailable: false,
      characterReady: true,
      virtualTryOnReady: true,
    });

    expect(screen.queryByRole('button', { name: /Start with/u })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Virtual Try-On' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create Character' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Configure Virtual Try-On' })).toBeEnabled();
    expect(screen.getAllByText(/Decart is not configured/u)).toHaveLength(2);
  });
});
