import type { SavedVideoSummary, VoiceSummary } from '@studio/contracts';
import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { lazy, Suspense, type RefObject } from 'react';
import { APP_PATHS } from '../app/paths';
import { ASSET_LIBRARY_DESCRIPTIONS } from '../features/assets/assetLibraryDescriptions';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedCharacterPrompt,
  SavedPrompt,
} from '../features/creative-assets/types';
import type { CreativeLibraryMirror } from '../features/creative-assets/useCreativeLibraryCloudSync';
import { Button, OverlayPanel } from '../ui';

const CreativeLibraryPortability = lazy(() =>
  import('../features/creative-assets/CreativeLibraryPortability').then((module) => ({
    default: module.CreativeLibraryPortability,
  })),
);
const SavedCharacterLibrary = lazy(() =>
  import('../features/account-library/SavedCreativeLibrary').then((module) => ({
    default: module.SavedCharacterLibrary,
  })),
);
const SavedOutfitLibrary = lazy(() =>
  import('../features/account-library/SavedCreativeLibrary').then((module) => ({
    default: module.SavedOutfitLibrary,
  })),
);
const VideoGallery = lazy(() =>
  import('../features/video-gallery/VideoGallery').then((module) => ({
    default: module.VideoGallery,
  })),
);
const VoiceLibrary = lazy(() =>
  import('../features/voice-effects/VoiceLibrary').then((module) => ({
    default: module.VoiceLibrary,
  })),
);
const deferredLibraryFallback = <p role="status">Loading studio tool…</p>;

/** Keeps the export/import block clear of the grid the library below it lays out for itself. */
const managedLibraryStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.lg,
});

interface StudioLibraryOverlaysProps {
  readonly pathname: string;
  readonly mainRef: RefObject<HTMLElement | null>;
  readonly repository: CreativeAssetRepository;
  readonly store: CreativeAssetStore;
  /** Where the creative library is actually stored, so these surfaces can say so accurately. */
  readonly creativeLibraryMirror: CreativeLibraryMirror;
  /** Leaves the library by consuming its history entry rather than pushing the hub on top of it. */
  readonly onClose: () => void;
  readonly focusedSavedVideoId: string | null;
  readonly onFocusedSavedVideoConsumed: () => void;
  readonly onUseVideo: (video: SavedVideoSummary, intent: 'play' | 'edit') => Promise<void>;
  readonly onCreateCharacter: () => void;
  readonly onCopyCharacter: (character: SavedCharacterPrompt) => void;
  readonly onOpenWardrobe: (character: SavedCharacterPrompt) => void;
  readonly onUseCharacter: (character: SavedCharacterPrompt) => void;
  readonly onCreateOutfit: () => void;
  readonly onUseOutfit: (outfit: SavedPrompt) => void;
  readonly voiceLibraryUnavailableReason: string | null;
  readonly onUseVoice: (voice: VoiceSummary) => void;
}

export const StudioLibraryOverlays = ({
  pathname,
  mainRef,
  repository,
  store,
  creativeLibraryMirror,
  onClose,
  focusedSavedVideoId,
  onFocusedSavedVideoConsumed,
  onUseVideo,
  onCreateCharacter,
  onCopyCharacter,
  onOpenWardrobe,
  onUseCharacter,
  onCreateOutfit,
  onUseOutfit,
  voiceLibraryUnavailableReason,
  onUseVoice,
}: StudioLibraryOverlaysProps) => {
  const theme = useTheme();

  return (
    <>
      <OverlayPanel
        open={pathname === APP_PATHS.videos}
        onClose={onClose}
        title="Videos"
        description={ASSET_LIBRARY_DESCRIPTIONS.videos}
        placement="fullscreen"
        size="wide"
        bodyMode="scroll"
        returnFocusRef={mainRef}
      >
        {pathname === APP_PATHS.videos ? (
          <Suspense fallback={deferredLibraryFallback}>
            <VideoGallery
              onUse={onUseVideo}
              focusVideoId={focusedSavedVideoId}
              onFocusVideoConsumed={onFocusedSavedVideoConsumed}
            />
          </Suspense>
        ) : null}
      </OverlayPanel>

      <OverlayPanel
        open={pathname === APP_PATHS.characters}
        onClose={onClose}
        title="Characters"
        description={ASSET_LIBRARY_DESCRIPTIONS.characters}
        headerActions={
          <div css={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={onCreateCharacter}>
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                css={{ width: '1.1rem', height: '1.1rem' }}
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              Create new character
            </Button>
          </div>
        }
        placement="fullscreen"
        size="wide"
        bodyMode="scroll"
        initialFocus="heading"
        returnFocusRef={mainRef}
      >
        {pathname === APP_PATHS.characters ? (
          <Suspense fallback={deferredLibraryFallback}>
            <div css={managedLibraryStyles(theme)}>
              <CreativeLibraryPortability
                repository={repository}
                store={store}
                mirror={creativeLibraryMirror}
              />
              <SavedCharacterLibrary
                items={store.savedCharacterPrompts}
                repository={repository}
                onCreateFrom={onCopyCharacter}
                onOpenWardrobe={onOpenWardrobe}
                onUse={onUseCharacter}
              />
            </div>
          </Suspense>
        ) : null}
      </OverlayPanel>

      <OverlayPanel
        open={pathname === APP_PATHS.outfits}
        onClose={onClose}
        title="Outfits"
        description={ASSET_LIBRARY_DESCRIPTIONS.outfits}
        placement="fullscreen"
        size="wide"
        bodyMode="scroll"
        returnFocusRef={mainRef}
      >
        {pathname === APP_PATHS.outfits ? (
          <Suspense fallback={deferredLibraryFallback}>
            <div css={managedLibraryStyles(theme)}>
              <CreativeLibraryPortability
                repository={repository}
                store={store}
                mirror={creativeLibraryMirror}
              />
              <SavedOutfitLibrary
                items={store.savedPrompts.filter((item) => item.modelModeId === 'lucy-vton-latest')}
                repository={repository}
                onCreate={onCreateOutfit}
                onUse={onUseOutfit}
              />
            </div>
          </Suspense>
        ) : null}
      </OverlayPanel>

      <OverlayPanel
        open={pathname === APP_PATHS.voices}
        onClose={onClose}
        title="Voices"
        description={ASSET_LIBRARY_DESCRIPTIONS.voices}
        placement="fullscreen"
        size="wide"
        bodyMode="scroll"
        initialFocus="heading"
        returnFocusRef={mainRef}
      >
        {pathname === APP_PATHS.voices ? (
          <Suspense fallback={deferredLibraryFallback}>
            <VoiceLibrary
              disabled={voiceLibraryUnavailableReason !== null}
              unavailableReason={voiceLibraryUnavailableReason}
              selectLabel="Use in Studio"
              onSelect={onUseVoice}
            />
          </Suspense>
        ) : null}
      </OverlayPanel>
    </>
  );
};
