import type { SavedVideoSummary, VoiceSummary } from '@studio/contracts';
import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { lazy, Suspense, type RefObject } from 'react';
import { APP_PATHS, type AssetDestination } from '../app/paths';
import type { AssetCountState } from '../features/assets/AssetLibraryTabs';
import { ASSET_LIBRARY_DESCRIPTIONS } from '../features/assets/assetLibraryDescriptions';
import { creativeLibraryStorageSummary } from '../features/creative-assets/creativeLibraryStorage';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedCharacterPrompt,
  SavedPrompt,
} from '../features/creative-assets/types';
import type { CreativeLibraryMirror } from '../features/creative-assets/useCreativeLibraryCloudSync';
import { Button, OverlayPanel } from '../ui';

const CreativeLibraryManagementMenu = lazy(() =>
  import('../features/creative-assets/CreativeLibraryManagementMenu').then((module) => ({
    default: module.CreativeLibraryManagementMenu,
  })),
);
const AssetLibraryTabs = lazy(() =>
  import('../features/assets/AssetLibraryTabs').then((module) => ({
    default: module.AssetLibraryTabs,
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

const managedLibraryStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.lg,
});

const libraryToolbarStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.md,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  '& p': {
    minWidth: 0,
    margin: 0,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.5,
  },
  '& p strong': { color: theme.colors.accentStrong },
  '& [data-library-toolbar-actions]': {
    flex: '0 0 auto',
    display: 'flex',
    alignItems: 'center',
    gap: theme.space.xs,
  },
  '@media (max-width: 40rem)': {
    alignItems: 'stretch',
    flexDirection: 'column',
    '& [data-library-toolbar-actions]': { justifyContent: 'space-between' },
    '& [data-library-toolbar-actions] > button:first-of-type': { flex: 1 },
  },
});

const overlayEyebrowStyles = (theme: Theme): CSSObject => ({
  display: 'block',
  marginBlockEnd: theme.space.xxs,
  color: theme.colors.textFaint,
  fontSize: theme.fontSizes.caption,
  fontWeight: 760,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
});

interface StudioLibraryOverlaysProps {
  readonly pathname: string;
  readonly mainRef: RefObject<HTMLElement | null>;
  readonly repository: CreativeAssetRepository;
  readonly store: CreativeAssetStore;
  readonly charactersCount: AssetCountState;
  readonly outfitsCount: AssetCountState;
  /** Where the creative library is actually stored, so these surfaces can say so accurately. */
  readonly creativeLibraryMirror: CreativeLibraryMirror;
  /** Replaces one library pathname with another without adding a close-blocking history entry. */
  readonly onSwitchLibrary: (destination: AssetDestination) => void;
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
  charactersCount,
  outfitsCount,
  creativeLibraryMirror,
  onSwitchLibrary,
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
  const libraryTabs = (active: AssetDestination) => (
    <Suspense fallback={<p role="status">Loading asset libraries…</p>}>
      <AssetLibraryTabs
        active={active}
        characters={charactersCount}
        outfits={outfitsCount}
        onSelect={onSwitchLibrary}
      />
    </Suspense>
  );
  const accountStorage = creativeLibraryStorageSummary(creativeLibraryMirror);
  const accountStorageDetail = (library: 'Characters' | 'Outfits') => {
    if (creativeLibraryMirror === 'cloud') {
      return library === 'Characters'
        ? 'Characters and wardrobe variants are saved to your Lightframe account.'
        : 'Outfits and saved prompts are saved to your Lightframe account.';
    }
    if (creativeLibraryMirror === 'checking') {
      return `Checking whether ${library.toLowerCase()} can sync with your Lightframe account.`;
    }
    return 'Export a backup before clearing local site data.';
  };
  const managementMenu = (
    <Suspense fallback={null}>
      <CreativeLibraryManagementMenu
        repository={repository}
        store={store}
        mirror={creativeLibraryMirror}
      />
    </Suspense>
  );

  return (
    <>
      <OverlayPanel
        open={pathname === APP_PATHS.videos}
        onClose={onClose}
        title="Videos"
        description={ASSET_LIBRARY_DESCRIPTIONS.videos}
        headerEyebrow={<span css={overlayEyebrowStyles(theme)}>Assets / Videos</span>}
        headerActions={libraryTabs('videos')}
        closeLabel="Close Assets"
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
        headerEyebrow={<span css={overlayEyebrowStyles(theme)}>Assets / Characters</span>}
        headerActions={libraryTabs('characters')}
        closeLabel="Close Assets"
        placement="fullscreen"
        size="wide"
        bodyMode="scroll"
        initialFocus="heading"
        returnFocusRef={mainRef}
      >
        {pathname === APP_PATHS.characters ? (
          <Suspense fallback={deferredLibraryFallback}>
            <div css={managedLibraryStyles(theme)}>
              <div css={libraryToolbarStyles(theme)}>
                <p data-account-library-storage="">
                  <strong>{accountStorage}</strong> {accountStorageDetail('Characters')}
                </p>
                <div data-library-toolbar-actions="">
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
                    Create character
                  </Button>
                  {managementMenu}
                </div>
              </div>
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
        headerEyebrow={<span css={overlayEyebrowStyles(theme)}>Assets / Outfits</span>}
        headerActions={libraryTabs('outfits')}
        closeLabel="Close Assets"
        placement="fullscreen"
        size="wide"
        bodyMode="scroll"
        returnFocusRef={mainRef}
      >
        {pathname === APP_PATHS.outfits ? (
          <Suspense fallback={deferredLibraryFallback}>
            <div css={managedLibraryStyles(theme)}>
              <div css={libraryToolbarStyles(theme)}>
                <p data-account-library-storage="">
                  <strong>{accountStorage}</strong> {accountStorageDetail('Outfits')}
                </p>
                <div data-library-toolbar-actions="">
                  <Button variant="primary" onClick={onCreateOutfit}>
                    Create outfit
                  </Button>
                  {managementMenu}
                </div>
              </div>
              <SavedOutfitLibrary
                items={store.savedPrompts.filter((item) => item.modelModeId === 'lucy-vton-latest')}
                repository={repository}
                onCreate={onCreateOutfit}
                onUse={onUseOutfit}
                showCreateAction={false}
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
        headerEyebrow={<span css={overlayEyebrowStyles(theme)}>Assets / Voices</span>}
        headerActions={libraryTabs('voices')}
        closeLabel="Close Assets"
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
