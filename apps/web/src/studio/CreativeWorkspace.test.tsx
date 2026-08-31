// @vitest-environment jsdom

import { createRef } from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../ui';
import { CreativeWorkspace, type CreativeWorkspaceProps } from './CreativeWorkspace';

const createProps = (stateOverrides: Partial<CreativeWorkspaceProps['state']> = {}) =>
  ({
    state: {
      activeTool: null,
      recordingActive: false,
      hasPlaybackVideo: true,
      ...stateOverrides,
    },
    actions: {
      onOpenEditVideo: vi.fn(),
      onOpenCharacter: vi.fn(),
      onOpenOutfit: vi.fn(),
      onOpenVoice: vi.fn(),
    },
    refs: {
      editVideoToggleRef: createRef<HTMLButtonElement>(),
      characterToggleRef: createRef<HTMLButtonElement>(),
      outfitToggleRef: createRef<HTMLButtonElement>(),
      voiceToggleRef: createRef<HTMLButtonElement>(),
    },
  }) satisfies CreativeWorkspaceProps;

afterEach(cleanup);

describe('CreativeWorkspace responsive tools', () => {
  // The rail offers the same capability at every width. It used to drop Character and Outfit
  // below 64rem with no entry point and no explanation, which is how a mobile operator concluded
  // the product had no AI tools at all.
  it('places Character, Outfit and Voice after Edit video, at every width', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps()} />
      </StudioDesignProvider>,
    );
    const rail = screen.getByRole('navigation', { name: 'Creative workspace tools' });
    expect(
      within(rail)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label')),
    ).toEqual(['Edit video', 'Select Character', 'Select Outfit', 'Select Voice']);
  });

  it('opens the voice chooser, and names the chosen voice in the control that owns it', () => {
    const props = createProps({ activeVoiceLabel: 'Warm studio' });
    render(
      <StudioDesignProvider>
        <CreativeWorkspace {...props} />
      </StudioDesignProvider>,
    );

    const voice = screen.getByRole('button', {
      name: 'Selected voice: Warm studio. Open voice options',
    });
    fireEvent.click(voice);
    expect(props.actions.onOpenVoice).toHaveBeenCalledOnce();
  });

  // A Project refuses any voice outright — setting one disables the visual Start. The rail has to
  // say so where the choice is offered, not leave the operator to discover it in the editor.
  it('refuses Voice with its reason wherever a Project cannot accept one', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace
          {...createProps({ voiceBlockedReason: 'Voice is not available inside a Project yet.' })}
        />
      </StudioDesignProvider>,
    );

    const voice = screen.getByRole('button', { name: 'Select Voice' });
    expect(voice).toBeDisabled();
    // Hidden from the compact rail, never from the accessibility tree it describes.
    expect(voice).toHaveAccessibleDescription('Voice is not available inside a Project yet.');
  });

  it('enables Edit video only for inactive playback and invokes the editor action', () => {
    const props = createProps();
    const view = render(
      <StudioDesignProvider>
        <CreativeWorkspace {...props} />
      </StudioDesignProvider>,
    );

    const editVideo = screen.getByRole('button', { name: 'Edit video' });
    expect(editVideo).toBeEnabled();
    fireEvent.click(editVideo);
    expect(props.actions.onOpenEditVideo).toHaveBeenCalledOnce();

    view.rerender(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps({ hasPlaybackVideo: false })} />
      </StudioDesignProvider>,
    );
    expect(screen.getByRole('button', { name: 'Edit video' })).toBeDisabled();

    view.rerender(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps({ recordingActive: true })} />
      </StudioDesignProvider>,
    );
    expect(screen.getByRole('button', { name: 'Edit video' })).toBeDisabled();
  });

  it('marks Edit video as the active dialog launcher while the editor is open', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps({ activeTool: 'edit-video' })} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Edit video' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('disables live-video tools while playback is available for editing', () => {
    const view = render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps()} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Select Character' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Select Outfit' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Shelf|Dock|Recipe/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit video' })).toBeEnabled();

    view.rerender(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps({ hasPlaybackVideo: false })} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Select Character' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Select Outfit' })).toBeEnabled();
  });

  it('says what a disabled tool is waiting on rather than only greying it out', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace
          {...createProps({
            hasPlaybackVideo: false,
            editVideoBlockedReason: 'Record or upload a video to edit it.',
            liveToolBlockedReason: 'Finish recording and finalization before building a character.',
          })}
        />
      </StudioDesignProvider>,
    );

    const editVideo = screen.getByRole('button', { name: 'Edit video' });
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
          {...createProps({
            editVideoBlockedReason: 'Record or upload a video to edit it.',
            liveToolBlockedReason:
              'Save and release or discard the current take before building a character.',
          })}
        />
      </StudioDesignProvider>,
    );

    const editVideo = screen.getByRole('button', { name: 'Edit video' });
    expect(editVideo).toBeEnabled();
    expect(editVideo).toHaveAccessibleDescription('Open the video editor');
    expect(screen.getByRole('button', { name: 'Select Outfit' })).toHaveAccessibleDescription(
      'Save and release or discard the current take before building a character.',
    );
  });

  it('keeps reusable creative setup available beside Project working-media playback', () => {
    render(
      <StudioDesignProvider>
        <CreativeWorkspace {...createProps({ liveToolsAvailableDuringPlayback: true })} />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Select Character' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Select Outfit' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: /Shelf|Dock|Recipe/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit video' })).toBeEnabled();
  });
});
