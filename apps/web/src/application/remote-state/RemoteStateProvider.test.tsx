// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { createRemoteStateQueryClient } from './RemoteStateProvider';

describe('remote server state defaults', () => {
  it('does not retry or refetch implicitly', () => {
    const client = createRemoteStateQueryClient();

    expect(client.getDefaultOptions()).toEqual({
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: {
        retry: false,
      },
    });

    client.clear();
  });
});
