// @vitest-environment jsdom

import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmationDialog, StudioDesignProvider } from '../ui';
import type { PrepareCharacterBuilderLaunchOptions } from '../features/character-builder/characterBuilderLaunch';
import {
  useCharacterBuilderLaunchController,
  type CharacterBuilderLaunchPreparer,
} from './useCharacterBuilderLaunchController';

const createLaunch = { target: { kind: 'create' as const } };

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

afterEach(() => {
  document.body.style.removeProperty('overflow');
});

describe('useCharacterBuilderLaunchController', () => {
  it('settles a replaced discard request as cancelled and opens only after explicit confirmation', async () => {
    const firstSettlement = vi.fn();
    const secondSettlement = vi.fn();
    const prepareLaunch: CharacterBuilderLaunchPreparer = vi.fn(
      async ({ confirmDiscard }: PrepareCharacterBuilderLaunchOptions) => {
        const first = confirmDiscard('First discard request.');
        void Promise.resolve(first).then(firstSettlement);
        const second = confirmDiscard('Second discard request.');
        void Promise.resolve(second).then(secondSettlement);
        return second;
      },
    );
    const onOpen = vi.fn();
    const { result } = renderHook(() =>
      useCharacterBuilderLaunchController({ onOpen, prepareLaunch }),
    );

    let launchPromise!: Promise<void>;
    act(() => {
      launchPromise = result.current.launchCharacterBuilder(createLaunch);
    });

    await waitFor(() => expect(result.current.discardPrompt).toBe('Second discard request.'));
    await waitFor(() => expect(firstSettlement).toHaveBeenCalledWith(false));

    act(() => result.current.resolveDiscard(true));
    await act(() => launchPromise);

    expect(secondSettlement).toHaveBeenCalledWith(true);
    expect(onOpen).toHaveBeenCalledOnce();
    expect(result.current.discardPrompt).toBeNull();
  });

  it('settles a pending confirmation as cancelled on unmount and suppresses late opening', async () => {
    const confirmationRequested = deferred<void>();
    const settled = vi.fn();
    const prepareLaunch: CharacterBuilderLaunchPreparer = vi.fn(
      async ({ confirmDiscard }: PrepareCharacterBuilderLaunchOptions) => {
        const confirmed = confirmDiscard('Discard before leaving.');
        confirmationRequested.resolve();
        const result = await confirmed;
        settled(result);
        return result;
      },
    );
    const onOpen = vi.fn();
    const hook = renderHook(() => useCharacterBuilderLaunchController({ onOpen, prepareLaunch }));

    let launchPromise!: Promise<void>;
    act(() => {
      launchPromise = hook.result.current.launchCharacterBuilder(createLaunch);
    });
    await confirmationRequested.promise;
    hook.unmount();
    await launchPromise;

    expect(settled).toHaveBeenCalledWith(false);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('keeps one launch in flight and reports preparation failures safely', async () => {
    const preparation = deferred<boolean>();
    const prepareLaunch = vi.fn(() => preparation.promise);
    const onOpen = vi.fn();
    const { result } = renderHook(() =>
      useCharacterBuilderLaunchController({ onOpen, prepareLaunch }),
    );

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.launchCharacterBuilder(createLaunch);
      second = result.current.launchCharacterBuilder(createLaunch);
    });
    await second;
    expect(prepareLaunch).toHaveBeenCalledOnce();

    await act(async () => {
      preparation.resolve(true);
      await first;
    });
    expect(onOpen).toHaveBeenCalledOnce();

    vi.mocked(prepareLaunch).mockRejectedValueOnce('unexpected failure');
    await act(() => result.current.launchCharacterBuilder(createLaunch));
    expect(result.current.launchError).toBe(
      'The Character Builder draft could not be prepared. Try again.',
    );
    act(() => result.current.dismissLaunchError());
    expect(result.current.launchError).toBeNull();
  });

  it('keeps confirmation focus topmost and restores the exact launch control on cancel', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const prepareLaunch: CharacterBuilderLaunchPreparer = async ({ confirmDiscard }) =>
      confirmDiscard('An unfinished character draft exists.');

    const Harness = () => {
      const invokerRef = useRef<HTMLButtonElement>(null);
      const controller = useCharacterBuilderLaunchController({ onOpen, prepareLaunch });
      return (
        <StudioDesignProvider>
          <button
            ref={invokerRef}
            type="button"
            onClick={() => void controller.launchCharacterBuilder(createLaunch)}
          >
            Edit saved character
          </button>
          <ConfirmationDialog
            open={controller.discardPrompt !== null}
            title="Unfinished character draft"
            description={controller.discardPrompt ?? 'Discard the unfinished draft?'}
            confirmLabel="Continue"
            cancelLabel="Cancel"
            danger
            onCancel={() => controller.resolveDiscard(false)}
            onConfirm={() => controller.resolveDiscard(true)}
          />
        </StudioDesignProvider>
      );
    };

    render(<Harness />);
    const invoker = screen.getByRole('button', { name: 'Edit saved character' });
    await user.click(invoker);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus());

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Unfinished character draft' }),
      ).not.toBeInTheDocument(),
    );
    expect(invoker).toHaveFocus();
    expect(onOpen).not.toHaveBeenCalled();
  });
});
