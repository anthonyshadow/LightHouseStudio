import type { SavedVideosResponse, SavedVideoSummary } from '@studio/contracts';
import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { apiErrorMessage } from '../../adapters/api-client/apiClient';
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

/**
 * Repairs a Saved Video that has no poster frame. Generation stays in the browser, and reads only
 * what the frame needs: a frame source is decoded straight from the Version's content URL, which
 * the API serves in byte ranges, and an uploaded image needs no read at all.
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
          ? ({
              kind: 'url',
              url: savedVideoContentUrl(video.id, video.currentVersion.id),
            } as const)
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
    // The response already carries the repaired record, so the loaded pages are patched in place
    // rather than refetched — the same treatment rename gives its result.
    onSuccess: (updated) => {
      queryClient.setQueriesData<InfiniteData<SavedVideosResponse>>(
        { queryKey: savedVideoQueryKeys.lists },
        (current) =>
          current
            ? {
                ...current,
                pages: current.pages.map((page) => ({
                  ...page,
                  videos: page.videos.map((video) => (video.id === updated.id ? updated : video)),
                })),
              }
            : current,
      );
    },
  });
};
