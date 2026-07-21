import { useTheme } from '@emotion/react';
import type { GuidedFlowStatus, ProjectStorageState } from '../guided-flow';
import { formatBytes, formatDuration, type RecordingArtifact } from '../recording';
import { Button, StatusNotice } from '../../ui';
import {
  allDoneGridStyles,
  controlPanelStyles,
  detailsGridStyles,
  primaryActionRowStyles,
  quietNavStyles,
  stageFrameStyles,
  stageLayoutStyles,
  videoPreviewStyles,
} from './GuidedExperience.styles';
import { GuidedStageHeader } from './GuidedExperienceChrome';

export type GuidedDownloadStageProps = Readonly<{
  storage: ProjectStorageState;
  status: GuidedFlowStatus;
  artifact: RecordingArtifact | null;
  videoHeight: number | undefined;
  selectedVoiceName: string | null;
  characterName: string;
  error: string | null;
  downloadStarted: boolean;
  onCreateAnother: () => void;
  onDownloadAgain: () => void;
  onDownload: () => void;
}>;

export const GuidedDownloadStage = ({
  storage,
  status,
  artifact,
  videoHeight,
  selectedVoiceName,
  characterName,
  error,
  downloadStarted,
  onCreateAnother,
  onDownloadAgain,
  onDownload,
}: GuidedDownloadStageProps) => {
  const theme = useTheme();

  if (status === 'download.complete') {
    return (
      <>
        <GuidedStageHeader
          title="All Done!"
          description="Your video download has started, and your character is saved for next time."
          storage={storage}
        />
        <StatusNotice role="status" tone="success">
          Camera off · Microphone off · AI session ended
        </StatusNotice>
        <div css={allDoneGridStyles(theme)}>
          <button type="button" onClick={onCreateAnother}>
            Create Another Character
          </button>
          <a href="/projects">View My Projects</a>
          <a href="/advanced">Back to Studio</a>
        </div>
        <div css={primaryActionRowStyles(theme)}>
          <Button variant="primary" onClick={onDownloadAgain}>
            Download Again
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <GuidedStageHeader
        title="Download & Done"
        description="Your video is ready. Review the final details, then start the browser download."
        storage={storage}
      />
      <div css={stageLayoutStyles(theme)}>
        <div css={stageFrameStyles(theme)}>
          {artifact ? (
            <video
              controls
              preload="metadata"
              src={artifact.objectUrl}
              aria-label="Final character video"
              css={videoPreviewStyles(theme)}
            />
          ) : (
            <StatusNotice>The final video is being restored from this browser.</StatusNotice>
          )}
        </div>
        <aside css={controlPanelStyles(theme)}>
          <h3>Your video is ready!</h3>
          {artifact ? (
            <dl css={detailsGridStyles(theme)}>
              <div>
                <dt>Duration</dt>
                <dd>{formatDuration(artifact.durationMs / 1_000)}</dd>
              </div>
              <div>
                <dt>Voice</dt>
                <dd>{selectedVoiceName ?? 'Original voice'}</dd>
              </div>
              <div>
                <dt>Quality</dt>
                <dd>{videoHeight ? `${videoHeight}p` : 'Best available'}</dd>
              </div>
              <div>
                <dt>Size</dt>
                <dd>{formatBytes(artifact.sizeBytes)}</dd>
              </div>
              <div>
                <dt>Character</dt>
                <dd>{characterName}</dd>
              </div>
            </dl>
          ) : null}
          {error ? (
            <StatusNotice role="alert" tone="danger">
              {error}
            </StatusNotice>
          ) : null}
          {downloadStarted ? (
            <StatusNotice role="status" tone="success">
              The browser download was started. Local completion is being saved.
            </StatusNotice>
          ) : null}
          <Button
            variant="primary"
            busy={status === 'download.dispatching'}
            disabled={!artifact}
            onClick={onDownload}
          >
            {downloadStarted ? 'Download Again' : 'Download Video'}
          </Button>
          <a href="/projects" css={quietNavStyles(theme)}>
            Go to My Projects
          </a>
        </aside>
      </div>
    </>
  );
};
