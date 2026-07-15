import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useEffect, useRef } from 'react';
import { Button, StatusNotice, Surface } from '../../ui';
import { formatBytes, formatDuration } from '../recording';
import type { RecordingController } from '../recording/types';
import type { VoiceProcessingController } from '../voice-effects/types';
import {
  VoiceEffectsPanel,
  type VoiceBrowserCapabilities,
} from '../voice-effects/VoiceEffectsPanel';

export type TakeDockProps = {
  recording: RecordingController;
  processing: VoiceProcessingController;
  elevenLabsAvailable: boolean;
  browserCapabilities?: VoiceBrowserCapabilities;
};

const gridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(15rem, 1.1fr) minmax(17rem, .9fr)',
  gap: theme.space.lg,
  '@media (max-width: 55rem)': { gridTemplateColumns: '1fr' },
});
const videoStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  maxHeight: '28rem',
  borderRadius: theme.radii.medium,
  background: '#050709',
});
const metadataStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.sm,
  margin: `${theme.space.sm} 0`,
  color: theme.colors.textMuted,
  fontSize: '0.78rem',
});
const actionStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  '& > *': { flex: '1 1 8rem' },
});

const headingStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  fontFamily: theme.type.display,
});

const introStyles = (theme: Theme): CSSObject => ({
  color: theme.colors.textMuted,
});

const downloadStyles = (theme: Theme, locked: boolean): CSSObject => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '2.85rem',
  minWidth: '2.75rem',
  borderRadius: theme.radii.medium,
  color: theme.colors.canvas,
  background: theme.colors.accent,
  fontWeight: 760,
  textDecoration: 'none',
  pointerEvents: locked ? 'none' : 'auto',
  opacity: locked ? 0.5 : 1,
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
});

export const TakeDock = ({
  recording,
  processing,
  elevenLabsAvailable,
  browserCapabilities,
}: TakeDockProps) => {
  const theme = useTheme();
  const videoRef = useRef<HTMLVideoElement>(null);
  const artifact = recording.presented;
  const locked = recording.processingState === 'processing';

  useEffect(() => {
    if (locked) videoRef.current?.pause();
  }, [artifact?.objectUrl, locked]);

  if (!artifact) return null;

  const discard = () => {
    const confirmed = window.confirm(
      'Discard this in-memory take? It cannot be recovered after the tab releases it.',
    );
    if (confirmed) {
      recording.discard();
      window.requestAnimationFrame(() => {
        document.getElementById('record-take-action')?.focus();
      });
    }
  };

  return (
    <Surface as="section" aria-labelledby="take-heading" tone="soft">
      <div css={gridStyles(theme)}>
        <div>
          <header>
            <h2 id="take-heading" css={headingStyles(theme)}>
              Latest take
            </h2>
            <p role="status" aria-live="polite" aria-atomic="true" css={introStyles(theme)}>
              Available in this tab only. Download it before refreshing or closing.
            </p>
          </header>
          <video
            ref={videoRef}
            css={videoStyles(theme)}
            controls={!locked}
            src={artifact.objectUrl}
            aria-label={
              locked
                ? 'Latest recorded take. Playback is unavailable while voice processing completes.'
                : 'Latest recorded take'
            }
            aria-busy={locked}
            onPlay={(event) => {
              if (locked) event.currentTarget.pause();
            }}
          />
          <div css={metadataStyles(theme)}>
            <span>{formatDuration(artifact.durationMs / 1000)}</span>
            <span>{formatBytes(artifact.sizeBytes)}</span>
            <span>{artifact.mimeType || 'browser default format'}</span>
          </div>
          <div css={actionStyles(theme)}>
            <a
              href={artifact.objectUrl}
              download={artifact.filename}
              aria-disabled={locked}
              tabIndex={locked ? -1 : undefined}
              css={downloadStyles(theme, locked)}
              onClick={(event) => {
                if (locked) {
                  event.preventDefault();
                  return;
                }
                recording.markDownloaded();
              }}
            >
              Download take
            </a>
            <Button variant="danger" disabled={locked} onClick={discard}>
              Discard
            </Button>
          </div>
          {recording.downloaded ? (
            <StatusNotice role="status" aria-live="polite" tone="success">
              A download was started. This tab still owns the temporary take.
            </StatusNotice>
          ) : null}
        </div>
        <VoiceEffectsPanel
          recording={recording}
          processing={processing}
          elevenLabsAvailable={elevenLabsAvailable}
          {...(browserCapabilities ? { browserCapabilities } : {})}
        />
      </div>
    </Surface>
  );
};
