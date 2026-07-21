import { useTheme } from '@emotion/react';
import type { GuidedFlowStatus, ProjectStorageState } from '../guided-flow';
import type { RecordingArtifact, VoiceProcessingState } from '../recording';
import { VoiceLibrary } from '../voice-effects';
import type { VoiceSummary } from '../voice-effects/types';
import { Button, StatusNotice } from '../../ui';
import {
  controlPanelStyles,
  videoPreviewStyles,
  voiceLayoutStyles,
} from './GuidedExperience.styles';
import { GuidedStageHeader } from './GuidedExperienceChrome';

type VoicePreviewVariant = 'original' | 'processed';

export type GuidedVoiceStageProps = Readonly<{
  storage: ProjectStorageState;
  status: GuidedFlowStatus;
  selectedVoiceName: string | null;
  previewVariant: VoicePreviewVariant;
  hasAudio: boolean;
  elevenLabsAvailable: boolean;
  voiceLibraryLoaded: boolean;
  processingState: VoiceProcessingState;
  original: RecordingArtifact | null;
  processed: RecordingArtifact | null;
  presented: RecordingArtifact | null;
  error: string | null;
  onPreviewVariantChange: (variant: VoicePreviewVariant) => void;
  onUseProcessedVoice: () => void;
  onChooseAnotherVoice: () => void;
  onKeepOriginal: () => void;
  onCancelProcessing: () => void;
  onLoadVoiceLibrary: () => void;
  onApplyVoice: (voice: VoiceSummary) => void;
  onRetrySelectedVoice: () => void;
}>;

export const GuidedVoiceStage = ({
  storage,
  status,
  selectedVoiceName,
  previewVariant,
  hasAudio,
  elevenLabsAvailable,
  voiceLibraryLoaded,
  processingState,
  original,
  processed,
  presented,
  error,
  onPreviewVariantChange,
  onUseProcessedVoice,
  onChooseAnotherVoice,
  onKeepOriginal,
  onCancelProcessing,
  onLoadVoiceLibrary,
  onApplyVoice,
  onRetrySelectedVoice,
}: GuidedVoiceStageProps) => {
  const theme = useTheme();
  const previewArtifact = (previewVariant === 'original' ? original : processed) ?? presented;

  return (
    <>
      <GuidedStageHeader
        title="Add Voice"
        description="Preview voices from safe stock samples, then apply one to the original audio only."
        storage={storage}
      />
      <div css={voiceLayoutStyles(theme)}>
        <section css={controlPanelStyles(theme)} aria-labelledby="voice-browser-heading">
          <h3 id="voice-browser-heading">
            {status === 'voice.review' ? 'Your new voice is ready' : 'Choose a voice'}
          </h3>
          {status === 'voice.review' ? (
            <>
              <StatusNotice role="status" tone="success">
                Compare the immutable original with {selectedVoiceName ?? 'the selected voice'}.
              </StatusNotice>
              <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.xs }}>
                <Button
                  variant={previewVariant === 'original' ? 'primary' : 'secondary'}
                  aria-pressed={previewVariant === 'original'}
                  onClick={() => onPreviewVariantChange('original')}
                >
                  Original
                </Button>
                <Button
                  variant={previewVariant === 'processed' ? 'primary' : 'secondary'}
                  aria-pressed={previewVariant === 'processed'}
                  disabled={!processed}
                  onClick={() => onPreviewVariantChange('processed')}
                >
                  {selectedVoiceName ?? 'Selected Voice'}
                </Button>
              </div>
              <Button variant="primary" onClick={onUseProcessedVoice}>
                Use This Voice
              </Button>
              <Button variant="secondary" onClick={onChooseAnotherVoice}>
                Choose Another
              </Button>
              <Button variant="quiet" onClick={onKeepOriginal}>
                Keep Original
              </Button>
            </>
          ) : status === 'voice.processing' ? (
            <>
              <StatusNotice role="status" title={`Applying ${selectedVoiceName ?? 'voice'}…`}>
                Preparing original audio → applying the voice → finishing your video. Video is not
                sent to the voice provider.
              </StatusNotice>
              <Button variant="quiet" onClick={onCancelProcessing}>
                Cancel Processing
              </Button>
            </>
          ) : (
            <>
              {!hasAudio ? (
                <StatusNotice tone="warning">
                  This take has no usable voice-ready audio. You can keep and download the original
                  video.
                </StatusNotice>
              ) : null}
              {!elevenLabsAvailable ? (
                <StatusNotice>
                  ElevenLabs is not configured. The immutable original remains ready to download.
                </StatusNotice>
              ) : !voiceLibraryLoaded ? (
                <Button variant="secondary" onClick={onLoadVoiceLibrary}>
                  Load My Voices · contacts provider
                </Button>
              ) : (
                <VoiceLibrary
                  collapsePublicImport
                  disabled={!hasAudio || processingState === 'processing'}
                  onApply={onApplyVoice}
                />
              )}
              {error ? (
                <StatusNotice role="alert" tone="danger">
                  {error} The original recording is unchanged.
                  {selectedVoiceName ? (
                    <Button size="small" variant="secondary" onClick={onRetrySelectedVoice}>
                      Retry {selectedVoiceName}
                    </Button>
                  ) : null}
                </StatusNotice>
              ) : null}
              <StatusNotice tone="warning" title="Privacy and provider credits">
                Voice previews use stock samples and never upload your take. Applying a voice sends
                only the immutable original audio for processing; video is not sent. Provider
                credits may apply.
              </StatusNotice>
              <Button variant="primary" onClick={onKeepOriginal}>
                Keep Original Voice
              </Button>
            </>
          )}
        </section>
        <aside css={controlPanelStyles(theme)}>
          <h3>Original video</h3>
          {previewArtifact ? (
            <video
              key={previewArtifact.objectUrl}
              controls
              preload="metadata"
              src={previewArtifact.objectUrl}
              aria-label="Recorded take voice comparison"
              css={videoPreviewStyles(theme)}
            />
          ) : (
            <StatusNotice>The saved take is being restored.</StatusNotice>
          )}
          <p>
            Every treatment starts from the protected original audio, never a previous treatment.
          </p>
        </aside>
      </div>
    </>
  );
};
