import { VIDEO_RESULT_MAX_BYTES, type SavedVideoSummary } from '@studio/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { ApiClientError, apiErrorMessage, apiFetch } from '../../adapters/api-client/apiClient';
import { readBoundedBlob } from '../../adapters/api-client/readBoundedBlob';
import {
  savedVideoContentUrl,
  saveSavedVideoThumbnail,
} from '../../adapters/api-client/savedVideosApi';
import { savedVideoQueryKeys } from './savedVideoQueryKeys';
import { createThumbnailForChoice, thumbnailChoiceNeedsVideo } from './thumbnailSource';
import type { SavedVideoThumbnailChoice } from './thumbnailSource';

export type GenerateSavedVideoPreviewInput = Readonly<{
  video: SavedVideoSummary;
  choice: SavedVideoThumbnailChoice;
}>;

/** The same bounded streaming read every other saved-video byte path uses. */
const readVersionBytes = async (video: SavedVideoSummary, signal: AbortSignal): Promise<Blob> => {
  const version = video.currentVersion;
  const response = await apiFetch(savedVideoContentUrl(video.id, version.id), {
    cache: 'no-store',
    headers: { Accept: version.mimeType },
    signal,
  });
  return readBoundedBlob(response, {
    maximumBytes: VIDEO_RESULT_MAX_BYTES,
    signal,
    acceptsContentType: (contentType) => contentType === version.mimeType,
    createError: (failure) =>
      new ApiClientError(
        failure === 'too-large'
          ? 'The saved video exceeded the app-owned 300 MB safety limit.'
          : 'The saved video response was empty or invalid.',
        502,
        failure === 'too-large' ? 'result_too_large' : 'result_invalid',
      ),
    abortMessage: 'Preview generation was cancelled.',
  });
};

/**
 * Repairs a Saved Video that has no poster frame. Generation stays in the browser: the current
 * Version's bytes are read only when the chosen source is a frame, and an uploaded image needs no
 * read at all.
 */
export const useGenerateSavedVideoPreview = () => {
  const queryClient = useQueryClient();
  const controller = useRef<AbortController | null>(null);

  useEffect(() => () => controller.current?.abort('unmount'), []);

  return useMutation({
    mutationFn: async ({ video, choice }: GenerateSavedVideoPreviewInput) => {
      controller.current?.abort('replaced');
      const active = new AbortController();
      controller.current = active;
      try {
        const media = thumbnailChoiceNeedsVideo(choice)
          ? await readVersionBytes(video, active.signal)
          : null;
        const poster = await createThumbnailForChoice(choice, media, active.signal);
        return await saveSavedVideoThumbnail(
          video.id,
          video.currentVersion.id,
          poster,
          active.signal,
        );
      } catch (error) {
        if (active.signal.aborted) throw error;
        throw new Error(
          apiErrorMessage(
            error,
            'The preview could not be generated from this video. Try again, or upload an image instead.',
          ),
          { cause: error },
        );
      } finally {
        if (controller.current === active) controller.current = null;
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: savedVideoQueryKeys.lists });
    },
  });
};
