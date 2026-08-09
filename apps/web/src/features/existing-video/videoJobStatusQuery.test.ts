// @vitest-environment jsdom

import type { VideoJobStatusResponse } from '@studio/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRemoteStateQueryClient } from '../../application/remote-state/RemoteStateProvider';
import { jsonScenario, videoJobPollingScenario } from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';

import { pollVideoJobStatus } from './videoJobStatusQuery';

const jobId = 'ec6962b2-3d27-4371-b829-da456f76c418';
const status = (
  value: VideoJobStatusResponse['status'],
  result: VideoJobStatusResponse['result'] = null,
): VideoJobStatusResponse => ({
  jobId,
  operation: 'character-swap',
  status: value,
  createdAt: '2026-08-09T12:00:00.000Z',
  updatedAt: '2026-08-09T12:00:01.000Z',
  expiresAt: '2026-08-09T13:00:00.000Z',
  nextPollAfterMs: 0,
  result,
  error: null,
});

const readyResult: NonNullable<VideoJobStatusResponse['result']> = {
  mimeType: 'video/mp4',
  container: 'mp4',
  videoCodec: 'avc',
  audioCodec: null,
  durationMs: 1_000,
  width: 1_280,
  height: 720,
  sizeBytes: 10,
  hasAudio: false,
};

const clients = new Set<ReturnType<typeof createRemoteStateQueryClient>>();

afterEach(() => {
  for (const client of clients) client.clear();
  clients.clear();
});

const queryClient = () => {
  const client = createRemoteStateQueryClient();
  clients.add(client);
  return client;
};

describe('video job status Query polling', () => {
  it('uses the submitted status as a seed and follows polling until terminal status', async () => {
    let requests = 0;
    mockApiServer.use(
      videoJobPollingScenario(jobId, [status('processing'), status('ready', readyResult)], () => {
        requests += 1;
      }),
    );
    const statuses: VideoJobStatusResponse[] = [];

    await expect(
      pollVideoJobStatus({
        queryClient: queryClient(),
        jobId,
        initialStatus: status('queued'),
        signal: new AbortController().signal,
        onStatus: (current) => statuses.push(current),
      }),
    ).resolves.toMatchObject({ status: 'ready' });

    expect(statuses.map((current) => current.status)).toEqual(['queued', 'processing', 'ready']);
    expect(requests).toBe(2);
  });

  it('does not read status again when the submitted response is already terminal', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await expect(
      pollVideoJobStatus({
        queryClient: queryClient(),
        jobId,
        initialStatus: status('ready', readyResult),
        signal: new AbortController().signal,
        onStatus: vi.fn(),
      }),
    ).resolves.toMatchObject({ status: 'ready' });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('cancels the active Query request through its AbortSignal', async () => {
    let querySignal: AbortSignal | undefined;
    let requests = 0;
    mockApiServer.use(
      jsonScenario('GET', `/api/video-jobs/${jobId}`, { kind: 'pending' }, (request) => {
        requests += 1;
        querySignal = request.signal;
      }),
    );
    const operation = new AbortController();
    const polling = pollVideoJobStatus({
      queryClient: queryClient(),
      jobId,
      signal: operation.signal,
      onStatus: vi.fn(),
    });
    await vi.waitFor(() => expect(querySignal).toBeDefined());

    operation.abort();

    await expect(polling).rejects.toMatchObject({ name: 'AbortError' });
    await vi.waitFor(() => expect(querySignal?.aborted).toBe(true));
    expect(requests).toBe(1);
  });
});
