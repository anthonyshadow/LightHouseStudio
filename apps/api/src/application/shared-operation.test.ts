import { describe, expect, it, vi } from 'vitest';
import { createSharedOperation } from './shared-operation.js';

describe('createSharedOperation', () => {
  it('isolates a cancelled waiter while another subscriber remains', async () => {
    let complete: ((value: string) => void) | undefined;
    let providerSignal: AbortSignal | undefined;
    const operation = createSharedOperation(
      (signal) =>
        new Promise<string>((resolve) => {
          providerSignal = signal;
          complete = resolve;
        }),
    );
    const first = new AbortController();
    const second = new AbortController();
    const firstResult = operation.subscribe(first.signal, () => new Error('first cancelled'));
    const secondResult = operation.subscribe(second.signal, () => new Error('second cancelled'));
    await vi.waitFor(() => expect(providerSignal).toBeInstanceOf(AbortSignal));

    first.abort();
    await expect(firstResult).rejects.toThrow('first cancelled');
    expect(providerSignal?.aborted).toBe(false);
    complete?.('stored result');

    await expect(secondResult).resolves.toBe('stored result');
  });

  it('aborts the underlying operation after its final waiter cancels', async () => {
    let providerSignal: AbortSignal | undefined;
    const operation = createSharedOperation(
      (signal) =>
        new Promise<string>((_resolve, reject) => {
          providerSignal = signal;
          signal.addEventListener('abort', () => reject(new Error('provider aborted')), {
            once: true,
          });
        }),
    );
    const caller = new AbortController();
    const result = operation.subscribe(caller.signal, () => new Error('caller cancelled'));
    await vi.waitFor(() => expect(providerSignal).toBeInstanceOf(AbortSignal));

    caller.abort();

    await expect(result).rejects.toThrow('caller cancelled');
    expect(providerSignal?.aborted).toBe(true);
    await expect(operation.result).rejects.toThrow('provider aborted');
  });

  it('rejects late subscribers after abandonment even if upstream has not settled', async () => {
    let complete: ((value: string) => void) | undefined;
    const operation = createSharedOperation(
      () =>
        new Promise<string>((resolve) => {
          complete = resolve;
        }),
    );
    const first = new AbortController();
    const firstResult = operation.subscribe(first.signal, () => new Error('first cancelled'));
    await vi.waitFor(() => expect(complete).toBeTypeOf('function'));

    first.abort();

    await expect(firstResult).rejects.toThrow('first cancelled');
    expect(operation.acceptingSubscribers).toBe(false);
    await expect(
      operation.subscribe(undefined, () => new Error('late subscriber rejected')),
    ).rejects.toThrow('late subscriber rejected');
    complete?.('late provider result');
    await expect(operation.result).resolves.toBe('late provider result');
  });
});
