// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ownedTakeArtifact, recordingControllerDouble } from '../../test/recordingController';
import { StudioDesignProvider } from '../../ui';
import { RecordingAction } from './RecordingAction';
import type {
  PresentedRecordingArtifact,
  RecordingSource,
  VideoCharacterAttribution,
} from './types';

const source: RecordingSource = {
  videoSource: 'local',
  audioSource: 'microphone',
  // jsdom implements no `MediaStream`, and this component never reads one — it hands the source
  // straight to the controller. Stood in the way `RecordingControls.test.tsx` stands it in.
  stream: {
    getVideoTracks: () => [],
    getAudioTracks: () => [],
  } as unknown as MediaStream,
};

interface SetupOptions {
  /** What the stage is holding when Record is pressed. */
  readonly original?: PresentedRecordingArtifact | null;
  /** What each `discard()` answers, in order. `false` means a take still being finalized. */
  readonly discards?: readonly boolean[];
  readonly characterAttribution?: VideoCharacterAttribution;
}

const setup = ({ original = null, discards = [true], characterAttribution }: SetupOptions = {}) => {
  const answers = [...discards];
  const discard = vi.fn(() => answers.shift() ?? true);
  const start = vi.fn(() => Promise.resolve());
  const onStop = vi.fn(() => Promise.resolve());
  const user = userEvent.setup();

  render(
    <StudioDesignProvider>
      <RecordingAction
        recording={recordingControllerDouble({
          // What the stage is holding and what the runtime answers when asked to let it go: the
          // two things every case here varies. A stage holding a take is presenting it.
          lifecycle: original ? 'recorded' : 'idle',
          original,
          presented: original,
          discard,
          start,
        })}
        source={source}
        mode="local"
        {...(characterAttribution ? { characterAttribution } : {})}
        modelOutputReady={false}
        supported
        onStop={onStop}
      />
    </StudioDesignProvider>,
  );

  const record = () => user.click(screen.getByRole('button', { name: 'Record' }));
  const answer = (label: 'Start new take' | 'Keep current take') =>
    user.click(screen.getByRole('button', { name: label }));

  return { discard, start, record, answer };
};

afterEach(cleanup);

describe('RecordingAction', () => {
  it('starts straight away when the stage is holding no take', async () => {
    const { discard, start, record } = setup();

    await record();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(discard).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledWith(source, 'local');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('asks before it replaces a take, and says what the press costs', async () => {
    const { record } = setup({ original: ownedTakeArtifact() });

    await record();

    // The question verbatim: what is replaced, where it lives, and how to keep it.
    expect(
      await screen.findByRole('dialog', { name: 'Start another take?' }),
    ).toHaveAccessibleDescription(
      'Starting another take replaces the current take, which only exists in this browser tab. Save it first if you want to keep it.',
    );
    expect(screen.getByRole('button', { name: 'Start new take' })).toBeInTheDocument();
    // Naming the safe half as keeping the take, rather than the primitive's bare 'Stay'.
    expect(screen.getByRole('button', { name: 'Keep current take' })).toBeInTheDocument();
  });

  it('drops the old take before it starts the new one, once the discard is allowed', async () => {
    const { discard, start, record, answer } = setup({ original: ownedTakeArtifact() });

    await record();
    await answer('Start new take');

    expect(discard).toHaveBeenCalledOnce();
    expect(start).toHaveBeenCalledWith(source, 'local');
    // No recorder may be opened while the previous take is still on the stage.
    const [discarded = 0] = discard.mock.invocationCallOrder;
    const [started = 0] = start.mock.invocationCallOrder;
    expect(discarded).toBeGreaterThan(0);
    expect(started).toBeGreaterThan(discarded);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('starts nothing and says why when the discard refuses', async () => {
    const { discard, start, record, answer } = setup({
      original: ownedTakeArtifact(),
      discards: [false],
    });

    await record();
    await answer('Start new take');

    expect(discard).toHaveBeenCalledOnce();
    // The operator answered the question and the take is still there; nothing may act as if it went.
    expect(start).not.toHaveBeenCalled();
    // Awaited rather than queried: the notice is behind the dismissed dialog's isolation until the
    // overlay finishes leaving.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This take is still finishing, so nothing was discarded. Try again in a moment.',
    );
    // The explanation arrives with the control that acts on it still live — no dead end.
    expect(screen.getByRole('button', { name: 'Record' })).toBeEnabled();
  });

  it('discards nothing and starts nothing when the question is declined', async () => {
    const { discard, start, record, answer } = setup({ original: ownedTakeArtifact() });

    await record();
    await answer('Keep current take');

    expect(discard).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the refusal on the next press, which is what the notice asked for', async () => {
    const { discard, start, record, answer } = setup({
      original: ownedTakeArtifact(),
      discards: [false, true],
    });

    await record();
    await answer('Start new take');
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await record();
    await answer('Start new take');

    expect(discard).toHaveBeenCalledTimes(2);
    expect(start).toHaveBeenCalledWith(source, 'local');
    // Nothing on screen still describes a press two presses ago.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('carries the character attribution into the take it starts', async () => {
    const attribution: VideoCharacterAttribution = {
      characterName: 'Lucy',
      characterVariantName: 'Studio jacket',
    };
    const { start, record } = setup({ characterAttribution: attribution });

    await record();

    expect(start).toHaveBeenCalledWith(source, 'local', attribution);
  });
});
