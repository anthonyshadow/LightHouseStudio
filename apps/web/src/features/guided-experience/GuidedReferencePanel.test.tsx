// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { GuidedReferenceChoice } from './GuidedReferencePanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('GuidedReferenceChoice', () => {
  it('starts without a selected choice and prompt-only makes no image request', async () => {
    const user = userEvent.setup();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const onPromptOnly = vi.fn();
    const onGenerateSelected = vi.fn();
    const onKeepExisting = vi.fn();

    render(
      <StudioDesignProvider>
        <GuidedReferenceChoice
          existingReferenceAvailable={false}
          error={null}
          onCancel={vi.fn()}
          onPromptOnly={onPromptOnly}
          onGenerateSelected={onGenerateSelected}
          onKeepExisting={onKeepExisting}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByText(/No choice is preselected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Prompt Only' })).not.toHaveAttribute(
      'aria-pressed',
    );
    expect(
      screen.getByRole('button', { name: 'Generate Reference & Continue' }),
    ).not.toHaveAttribute('aria-pressed');
    expect(
      screen.queryByRole('button', { name: 'Keep Existing Reference' }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Continue with Prompt Only' }));

    expect(onPromptOnly).toHaveBeenCalledOnce();
    expect(onGenerateSelected).not.toHaveBeenCalled();
    expect(onKeepExisting).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('offers existing-reference reuse only when a valid reference is available', () => {
    const { rerender } = render(
      <StudioDesignProvider>
        <GuidedReferenceChoice
          existingReferenceAvailable
          error={null}
          onCancel={vi.fn()}
          onPromptOnly={vi.fn()}
          onGenerateSelected={vi.fn()}
          onKeepExisting={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Keep Existing Reference' })).toBeInTheDocument();

    rerender(
      <StudioDesignProvider>
        <GuidedReferenceChoice
          existingReferenceAvailable={false}
          error={null}
          onCancel={vi.fn()}
          onPromptOnly={vi.fn()}
          onGenerateSelected={vi.fn()}
          onKeepExisting={vi.fn()}
        />
      </StudioDesignProvider>,
    );
    expect(
      screen.queryByRole('button', { name: 'Keep Existing Reference' }),
    ).not.toBeInTheDocument();
  });
});
