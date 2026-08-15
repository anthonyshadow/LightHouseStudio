import type { SavedVideoSummary } from '@studio/contracts';
import { lazy, Suspense, type RefObject } from 'react';
import { APP_PATHS } from '../app/paths';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedCharacterPrompt,
  SavedPrompt,
} from '../features/creative-assets/types';
import { Button, OverlayPanel } from '../ui';

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

interface StudioLibraryOverlaysProps {
  readonly pathname: string;
  readonly mainRef: RefObject<HTMLElement | null>;
  readonly repository: CreativeAssetRepository;
  readonly store: CreativeAssetStore;
  readonly onNavigate: (path: string) => void;
  readonly onUseVideo: (video: SavedVideoSummary, intent: 'play' | 'edit') => Promise<void>;
  readonly onCreateCharacter: () => void;
  readonly onCopyCharacter: (character: SavedCharacterPrompt) => void;
  readonly onOpenWardrobe: (character: SavedCharacterPrompt) => void;
  readonly onUseCharacter: (character: SavedCharacterPrompt) => void;
  readonly onCreateOutfit: () => void;
  readonly onUseOutfit: (outfit: SavedPrompt) => void;
}

export const StudioLibraryOverlays = ({
  pathname,
  mainRef,
  repository,
  store,
  onNavigate,
  onUseVideo,
  onCreateCharacter,
  onCopyCharacter,
  onOpenWardrobe,
  onUseCharacter,
  onCreateOutfit,
  onUseOutfit,
}: StudioLibraryOverlaysProps) => {
  return (
    <>
      <OverlayPanel
        open={pathname === APP_PATHS.videos}
        onClose={() => onNavigate(APP_PATHS.assets)}
        title="Videos"
        description="Preview, edit in Studio, download, rename, remove, or inspect exact retained Versions."
        placement="fullscreen"
        size="wide"
        bodyMode="scroll"
        returnFocusRef={mainRef}
      >
        {pathname === APP_PATHS.videos ? (
          <Suspense fallback={deferredLibraryFallback}>
            <VideoGallery onUse={onUseVideo} />
          </Suspense>
        ) : null}
      </OverlayPanel>

      <OverlayPanel
        open={pathname === APP_PATHS.characters}
        onClose={() => onNavigate(APP_PATHS.assets)}
        title="Characters"
        description="Manage your Lucy 2.5 cast and their wardrobe."
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
            <SavedCharacterLibrary
              items={store.savedCharacterPrompts}
              repository={repository}
              onCreateFrom={onCopyCharacter}
              onOpenWardrobe={onOpenWardrobe}
              onUse={onUseCharacter}
            />
          </Suspense>
        ) : null}
      </OverlayPanel>

      <OverlayPanel
        open={pathname === APP_PATHS.outfits}
        onClose={() => onNavigate(APP_PATHS.assets)}
        title="Outfits"
        description="Choose a saved Virtual Try-On outfit for Studio or remove it from your library."
        placement="fullscreen"
        size="wide"
        bodyMode="scroll"
        returnFocusRef={mainRef}
      >
        {pathname === APP_PATHS.outfits ? (
          <Suspense fallback={deferredLibraryFallback}>
            <SavedOutfitLibrary
              items={store.savedPrompts.filter((item) => item.modelModeId === 'lucy-vton-latest')}
              repository={repository}
              onCreate={onCreateOutfit}
              onUse={onUseOutfit}
            />
          </Suspense>
        ) : null}
      </OverlayPanel>

      <OverlayPanel
        open={pathname === APP_PATHS.voices}
        onClose={() => onNavigate(APP_PATHS.assets)}
        title="Voices"
        description="Preview the provider catalog and manage voices saved for this account. Select a voice from an active video workflow when you are ready to use it."
        placement="fullscreen"
        size="wide"
        bodyMode="scroll"
        initialFocus="heading"
        returnFocusRef={mainRef}
      >
        {pathname === APP_PATHS.voices ? (
          <Suspense fallback={deferredLibraryFallback}>
            <VoiceLibrary disabled onSelect={() => undefined} />
          </Suspense>
        ) : null}
      </OverlayPanel>
    </>
  );
};
