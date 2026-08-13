// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import type { UploadedReferenceImageAsset } from '@studio/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionReferenceImage } from '../features/media-session/types';
import {
  useReferenceRecipeHydration,
  type PendingReferenceRecipeUse,
} from './useReferenceRecipeHydration';

const fetchReferenceImageMetadata = vi.hoisted(() => vi.fn());
const hydrateReferenceImage = vi.hoisted(() => vi.fn());

vi.mock('../adapters/api-client/apiClient', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, fetchReferenceImageMetadata, hydrateReferenceImage };
});

const asset: UploadedReferenceImageAsset = {
  assetId: '8f45ea24-c274-41a5-a988-aa0602115191',
  mimeType: 'image/png',
  byteSize: 5,
  source: 'uploaded',
  width: 800,
  height: 1200,
  createdAt: '2026-07-21T12:00:00.000Z',
  updatedAt: '2026-07-21T12:00:00.000Z',
  contentUrl: '/api/reference-images/8f45ea24-c274-41a5-a988-aa0602115191/content',
};

const hydrated: SessionReferenceImage = {
  kind: 'persisted',
  assetId: asset.assetId,
  file: new File(['image'], 'reference.png', { type: 'image/png' }),
  contentUrl: asset.contentUrl,
};

const pending: PendingReferenceRecipeUse = {
  mode: 'lucy-latest',
  prompt: 'A calm presenter.',
  referenceImageAssetId: asset.assetId,
  preserveCurrentReference: false,
  savedPromptId: 'saved-prompt',
  destination: 'shelf',
};

beforeEach(() => {
  fetchReferenceImageMetadata.mockReset().mockResolvedValue(asset);
  hydrateReferenceImage.mockReset().mockResolvedValue(hydrated);
});

describe('useReferenceRecipeHydration', () => {
  it('runs one metadata/content path before exposing the atomic commit result', async () => {
    const onCommit = vi.fn(() => true);
    const { result } = renderHook(() =>
      useReferenceRecipeHydration({
        canStart: () => true,
        currentReferenceImage: () => null,
        onCommit,
      }),
    );

    act(() => {
      result.current.useRecipe(pending);
    });

    await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
    const metadataSignal = fetchReferenceImageMetadata.mock.calls[0]?.[1] as AbortSignal;
    expect(metadataSignal).toBeInstanceOf(AbortSignal);
    expect(hydrateReferenceImage).toHaveBeenCalledWith(asset.assetId, asset, metadataSignal);
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        pending,
        referenceImage: hydrated,
        storedReferenceMetadata: asset,
        appliedPrompt: pending.prompt,
        enhance: false,
      }),
    );
    expect(result.current).toMatchObject({ pending: false, failureMessage: null });
  });

  it('keeps the handoff pending until the durable commit settles', async () => {
    let resolveCommit: ((committed: boolean) => void) | undefined;
    const onCommit = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveCommit = resolve;
        }),
    );
    const { result } = renderHook(() =>
      useReferenceRecipeHydration({
        canStart: () => true,
        currentReferenceImage: () => null,
        onCommit,
      }),
    );

    act(() => {
      result.current.useRecipe(pending);
    });
    await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
    expect(result.current.pending).toBe(true);

    await act(async () => {
      resolveCommit?.(true);
      await Promise.resolve();
    });

    expect(result.current).toMatchObject({ pending: false, failureMessage: null });
  });

  it('keeps the exact failed input for a text-only recovery without another read', async () => {
    fetchReferenceImageMetadata.mockRejectedValueOnce(new Error('unavailable'));
    const onCommit = vi.fn(() => true);
    const { result } = renderHook(() =>
      useReferenceRecipeHydration({
        canStart: () => true,
        currentReferenceImage: () => null,
        onCommit,
      }),
    );

    act(() => {
      result.current.useRecipe(pending);
    });
    await waitFor(() => expect(result.current.failureMessage).not.toBeNull());

    act(() => {
      result.current.continueWithoutReference();
    });
    await waitFor(() => expect(onCommit).toHaveBeenCalledOnce());
    expect(fetchReferenceImageMetadata).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(
      expect.objectContaining({
        pending,
        referenceImage: null,
        storedReferenceMetadata: null,
        appliedPrompt: pending.prompt,
        enhance: false,
      }),
    );
  });

  it('does not allow missing image-only outfits to continue without their reference', async () => {
    fetchReferenceImageMetadata.mockRejectedValueOnce(new Error('missing'));
    const onCommit = vi.fn(() => true);
    const { result } = renderHook(() =>
      useReferenceRecipeHydration({
        canStart: () => true,
        currentReferenceImage: () => null,
        onCommit,
      }),
    );
    act(() => {
      result.current.useRecipe({
        mode: 'lucy-vton-latest',
        prompt: '',
        referenceImageAssetId: asset.assetId,
        vtonInputKind: 'saved-outfit',
        enhancePrompt: false,
        preserveCurrentReference: false,
        destination: 'shelf',
      });
    });
    await waitFor(() => expect(result.current.failureMessage).not.toBeNull());
    expect(result.current.canContinueWithoutReference).toBe(false);
    act(() => result.current.continueWithoutReference());
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('invalidates an aborted operation token even when the transport resolves late', async () => {
    let resolveMetadata: ((value: UploadedReferenceImageAsset) => void) | undefined;
    fetchReferenceImageMetadata.mockImplementationOnce(
      () =>
        new Promise<UploadedReferenceImageAsset>((resolve) => {
          resolveMetadata = resolve;
        }),
    );
    const onCommit = vi.fn(() => true);
    const rendered = renderHook(() =>
      useReferenceRecipeHydration({
        canStart: () => true,
        currentReferenceImage: () => null,
        onCommit,
      }),
    );

    act(() => {
      rendered.result.current.useRecipe(pending);
    });
    rendered.unmount();
    await act(async () => {
      resolveMetadata?.(asset);
      await Promise.resolve();
    });

    expect(hydrateReferenceImage).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('does not start any effect when the caller rejects the transition guard', () => {
    const onCommit = vi.fn(() => true);
    const { result } = renderHook(() =>
      useReferenceRecipeHydration({
        canStart: () => false,
        currentReferenceImage: () => null,
        onCommit,
      }),
    );

    act(() => {
      result.current.useRecipe(pending);
    });

    expect(fetchReferenceImageMetadata).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ pending: false, failureMessage: null });
  });
});
