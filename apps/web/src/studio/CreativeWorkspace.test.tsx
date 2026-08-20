// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../ui';
import { CreativeWorkspace, type CreativeWorkspaceProps } from './CreativeWorkspace';

const createProps = (
  showDesktopAiTools: boolean,
  stateOverrides: Partial<CreativeWorkspaceProps['state']> = {},
) =>
  ({
    state: {
      activeTool: null,
      showDesktopAiTools,
      recordingActive: false,
      hasPlaybackVideo: true,
      ...stateOverrides,
    },
    actions: {
      onOpenEditVideo: vi.fn(),
      onOpenCharacter: vi.fn(),
      onOpenOutfit: vi.fn(),
    },
    refs: {
      editVideoToggleRef: createRef<HTMLButtonElement>(),
      characterToggleRef: createRef<HTMLButtonElement>(),
      outfitToggleRef: createRef<HTMLButtonElement>(),
    },
  }) satisfies CreativeWorkspaceProps;

afterEach(cleanup);

describe('CreativeWorkspace responsive tools', () => {
  it('places Character and Outfit after Edit Video in the desktop rail', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true)} />
      </StudioDesignProvider>,
    );
    const rail = screen.getByRole('navigation', { name: 'Creative workspace tools' });
    expect(
      within(rail)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Edit Video', 'Select Character', 'Select Outfit']);
  });

  it('keeps the compact row focused on editing', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(false)} />
      </StudioDesignProvider>,
    );
    const rail = screen.getByRole('navigation', { name: 'Creative workspace tools' });
    expect(
      within(rail)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Edit Video']);
  });

  it('enables Edit Video only for inactive playback and invokes the editor action', () => {
    const props = createProps(true);
    const view = render(
      <StudioDesignProvider>
        <CreativeWorkspace {...props} />
      </StudioDesignProvider>,
    );

    const editVideo = screen.getByRole('button', { name: 'Edit Video' });
    expect(editVideo).toBeEnabled();
    fireEvent.click(editVideo);
    expect(props.actions.onOpenEditVideo).toHaveBeenCalledOnce();

    view.rerender(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true, { hasPlaybackVideo: false })} />
      </StudioDesignProvider>,
    );
    expect(screen.getByRole('button', { name: 'Edit Video' })).toBeDisabled();

    view.rerender(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true, { recordingActive: true })} />
      </StudioDesignProvider>,
    );
    expect(screen.getByRole('button', { name: 'Edit Video' })).toBeDisabled();
  });

  it('marks Edit Video as the active dialog launcher while the editor is open', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true, { activeTool: 'edit-video' })} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Edit Video' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('disables live-video tools while playback is available for editing', () => {
    const view = render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true)} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Select Character' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select Outfit' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Shelf|Dock|Recipe/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Video' })).toBeEnabled();

    view.rerender(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true, { hasPlaybackVideo: false })} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Select Character' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Select Outfit' })).toBeEnabled();
  });

  it('says what a disabled tool is waiting on rather than only greying it out', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace
          {...createProps(true, {
            hasPlaybackVideo: false,
            editVideoBlockedReason: 'Record or upload a video to edit it.',
            liveToolBlockedReason: 'Finish recording and finalization before building a character.',
          })}
        />
      </StudioDesignProvider>,
    );

    const editVideo = screen.getByRole('button', { name: 'Edit Video' });
    expect(editVideo).toBeDisabled();
    expect(editVideo).toHaveAccessibleDescription('Record or upload a video to edit it.');
    expect(editVideo).toHaveAttribute('title', 'Record or upload a video to edit it.');
    // Nothing blocks the live tools before media exists: choosing a Character is how the operator
    // prepares one. They keep their purpose, not a reason they are not waiting on.
    const character = screen.getByRole('button', { name: 'Select Character' });
    expect(character).toBeEnabled();
    expect(character).toHaveAccessibleDescription('Choose or build an AI character');
    expect(character).not.toHaveAttribute('title');
  });

  it('drops a tool reason the moment the tool can act', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace
          {...createProps(true, {
            editVideoBlockedReason: 'Record or upload a video to edit it.',
            liveToolBlockedReason:
              'Save and release or discard the current take before building a character.',
          })}
        />
      </StudioDesignProvider>,
    );

    const editVideo = screen.getByRole('button', { name: 'Edit Video' });
    expect(editVideo).toBeEnabled();
    expect(editVideo).toHaveAccessibleDescription('Open the video editor');
    expect(screen.getByRole('button', { name: 'Select Outfit' })).toHaveAccessibleDescription(
      'Save and release or discard the current take before building a character.',
    );
  });

  it('keeps reusable creative setup available beside Project working-media playback', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps(true, { liveToolsAvailableDuringPlayback: true })} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Select Character' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Select Outfit' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Shelf|Dock|Recipe/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit Video' })).toBeEnabled();
  });
});
