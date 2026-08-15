import { useTheme } from '@emotion/react';
import { lazy, Suspense, type RefObject } from 'react';
import type { RecordingController } from '../features/recording/types';
import type { VoiceBrowserCapabilities } from '../features/voice-effects/voiceCapabilities';
import type { VoiceProcessingController } from '../features/voice-effects/types';
import { OverlayPanel } from '../ui';
import type { ActiveOverlay } from './useStudioOverlayController';
import type { SaveVideoState } from '../features/saved-videos/useSaveVideo';

const TakeDock = lazy(() =>
  import('../features/take-review/TakeDock').then((module) => ({ default: module.TakeDock })),
);

export const StudioTakeOverlays = ({
  activeOverlay,
  recording,
  processing,
  elevenLabsAvailable,
  elevenLabsModel,
  browserCapabilities,
  mainRef,
  onClose,
  onDiscardTake,
  onEditVideo,
  onOpenVoiceTreatments,
  onBackToTakeReview,
  onSaveVideo,
  saveVideoState,
  onReplaceSavedVideo,
  hasUnsavedChanges,
}: {
  activeOverlay: ActiveOverlay;
  recording: RecordingController;
  processing: VoiceProcessingController;
  elevenLabsAvailable: boolean;
  elevenLabsModel: string | null | undefined;
  browserCapabilities: VoiceBrowserCapabilities;
  mainRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onDiscardTake: () => void;
  onEditVideo?: () => void;
  onOpenVoiceTreatments: () => void;
  onBackToTakeReview: () => void;
  onSaveVideo?: () => void;
  saveVideoState?: SaveVideoState;
  onReplaceSavedVideo?: () => void;
  hasUnsavedChanges?: boolean;
}) => {
  const theme = useTheme();
  return (
    <>
      <OverlayPanel
        open={activeOverlay === 'take-review' && Boolean(recording.presented)}
        onClose={onClose}
        title="Latest Take"
        description="Playback stays on the stage while you review this temporary in-memory take."
        placement="bottom"
        size="wide"
        bodyMode="contained"
        returnFocusRef={mainRef}
      >
        <Suspense fallback={<p role="status">Loading studio tool…</p>}>
          <TakeDock
            view="take"
            recording={recording}
            processing={processing}
            elevenLabsAvailable={elevenLabsAvailable}
            {...(elevenLabsModel !== undefined ? { elevenLabsModel } : {})}
            browserCapabilities={browserCapabilities}
            onCloseTake={onClose}
            onDiscardTake={onDiscardTake}
            {...(onEditVideo ? { onEditVideo } : {})}
            onOpenVoiceTreatments={onOpenVoiceTreatments}
            {...(onSaveVideo ? { onSaveVideo } : {})}
            {...(saveVideoState ? { saveVideoState } : {})}
            {...(onReplaceSavedVideo ? { onReplaceSavedVideo } : {})}
            {...(hasUnsavedChanges !== undefined ? { hasUnsavedChanges } : {})}
          />
        </Suspense>
      </OverlayPanel>

      <OverlayPanel
        open={activeOverlay === 'voice-treatments' && Boolean(recording.presented)}
        onClose={onClose}
        title="Voice Treatments"
        description="Every treatment starts from the immutable original audio sidecar."
        headerEyebrow={
          <button
            type="button"
            css={{
              minHeight: '2.75rem',
              display: 'inline-flex',
              alignItems: 'center',
              padding: 0,
              border: 0,
              color: theme.colors.accent,
              background: 'transparent',
              fontSize: theme.fontSizes.caption,
              fontWeight: 760,
              cursor: 'pointer',
            }}
            onClick={onBackToTakeReview}
          >
            ‹ Back to take review
          </button>
        }
        placement="bottom"
        size="wide"
        height="tall"
        centered
        bodyMode="contained"
        returnFocusRef={mainRef}
      >
        <Suspense fallback={<p role="status">Loading studio tool…</p>}>
          <TakeDock
            view="voice"
            recording={recording}
            processing={processing}
            elevenLabsAvailable={elevenLabsAvailable}
            {...(elevenLabsModel !== undefined ? { elevenLabsModel } : {})}
            browserCapabilities={browserCapabilities}
          />
        </Suspense>
      </OverlayPanel>
    </>
  );
};
