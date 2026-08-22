import { useCallback, useEffect, useRef } from 'react';
import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { Button, ConfirmationRequestDialog, useConfirmationRequest } from '../../ui';
import type { StudioMode } from '../media-session';
import type { RecordingController, RecordingSource, VideoCharacterAttribution } from './types';

export type RecordingActionProps = {
  recording: RecordingController;
  source: RecordingSource | null;
  mode: StudioMode;
  characterAttribution?: VideoCharacterAttribution | null | undefined;
  modelOutputReady: boolean;
  supported?: boolean;
  blockedReason?: string;
  onStop: () => Promise<void>;
};

type RecordingAvailability = Pick<
  RecordingActionProps,
  'mode' | 'modelOutputReady' | 'source' | 'supported'
> & {
  blockedReason: string | undefined;
  processing: boolean;
};

const recordingUnavailableReason = ({
  supported,
  processing,
  blockedReason,
  source,
  mode,
  modelOutputReady,
}: RecordingAvailability): string | null => {
  if (!supported) return 'Recording is unavailable in this browser.';
  if (processing) return 'Finish or cancel voice processing before replacing this take.';
  if (blockedReason) return blockedReason;

  if (!source) {
    switch (mode) {
      case 'local':
        return 'Start local preview to enable Record.';
      case 'lucy-latest':
        return 'Start Character AI and wait for live output to enable Record.';
      case 'lucy-vton-latest':
        return 'Start Virtual Try-On AI and wait for live output to enable Record.';
    }
  }

  if (mode !== 'local' && !modelOutputReady) {
    return 'Recording unlocks when transformed output has a live video track.';
  }
  return null;
};

const recordingActiveStyles = (theme: Theme): CSSObject => ({
  color: theme.colors.text,
  borderColor: theme.colors.recording,
  background: `linear-gradient(135deg, ${theme.colors.recording}, ${theme.colors.danger})`,
  boxShadow: theme.shadows.recording,
});

// Idle Record is the stage's primary action and takes the mint primary treatment from
// `Button variant="primary"`, so only the dot glyph is overridden — kept in the recording red
// family but deepened so it still reads against mint.
const recordGlyphStyles = (theme: Theme): CSSObject => ({
  '& svg': { color: theme.colors.recordingSoft },
});

const disabledReasonStyles = (): CSSObject => ({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  border: 0,
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
});

const RecordIcon = ({ active }: { active: boolean }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    {active ? (
      <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" fill="currentColor" />
    ) : (
      <circle cx="12" cy="12" r="5.5" fill="currentColor" />
    )}
  </svg>
);

export const RecordingAction = ({
  recording,
  source,
  mode,
  characterAttribution,
  modelOutputReady,
  supported = 'MediaRecorder' in window,
  blockedReason,
  onStop,
}: RecordingActionProps) => {
  const theme = useTheme();
  const actionRef = useRef<HTMLButtonElement>(null);
  const previousLifecycleRef = useRef<RecordingController['lifecycle'] | null>(null);
  const active = recording.lifecycle === 'recording' || recording.lifecycle === 'stopping';
  const unavailableReason = recordingUnavailableReason({
    supported,
    processing: recording.processingState === 'processing',
    blockedReason,
    source,
    mode,
    modelOutputReady,
  });
  const unavailable = unavailableReason !== null;

  useEffect(() => {
    if (recording.lifecycle === previousLifecycleRef.current) return;
    previousLifecycleRef.current = recording.lifecycle;
    if (recording.lifecycle === 'recording') {
      actionRef.current?.focus();
    }
  }, [recording.lifecycle]);

  const confirmation = useConfirmationRequest();

  const start = useCallback(async () => {
    if (!source) return;
    if (recording.original) {
      const proceed = await confirmation.ask({
        title: 'Start another take?',
        description:
          'Starting another take replaces the current in-memory clip. Save it first if you want to keep it.',
        confirmLabel: 'Start new take',
        cancelLabel: 'Keep current take',
        danger: true,
      });
      if (!proceed) return;
    }
    if (recording.original) recording.discard();
    if (characterAttribution) await recording.start(source, mode, characterAttribution);
    else await recording.start(source, mode);
  }, [characterAttribution, confirmation, mode, recording, source]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        event.code !== 'Space' ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        document.querySelector('[aria-modal="true"]')
      ) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          'input, textarea, select, button, a[href], audio, video, summary, [contenteditable]:not([contenteditable="false"]), [role], [tabindex]:not([tabindex="-1"])',
        )
      ) {
        return;
      }

      if (recording.lifecycle === 'recording') {
        event.preventDefault();
        void onStop();
        return;
      }
      if (!active && !unavailable) {
        event.preventDefault();
        void start();
      }
    };

    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [active, onStop, recording.lifecycle, start, unavailable]);

  if (!active && !source) return null;

  return (
    <>
      {active ? (
        <Button
          ref={actionRef}
          id="record-take-action"
          variant="danger"
          busy={recording.lifecycle === 'stopping'}
          aria-label="Stop recording"
          aria-keyshortcuts="Space"
          css={recordingActiveStyles(theme)}
          onClick={() => void onStop()}
        >
          <RecordIcon active />
          <span data-secondary-label>Stop recording</span>
        </Button>
      ) : (
        <Button
          ref={actionRef}
          id="record-take-action"
          variant="primary"
          disabled={unavailable}
          aria-label="Record"
          aria-describedby={unavailableReason ? 'recording-disabled-reason' : undefined}
          title={unavailableReason ?? undefined}
          aria-keyshortcuts="Space"
          css={recordGlyphStyles(theme)}
          onClick={() => void start()}
        >
          <RecordIcon active={false} />
          <span data-secondary-label>Record</span>
        </Button>
      )}
      {unavailableReason ? (
        <p
          id="recording-disabled-reason"
          data-disabled-reason="true"
          role="status"
          css={disabledReasonStyles()}
        >
          {unavailableReason}
        </p>
      ) : null}
      <ConfirmationRequestDialog request={confirmation} />
    </>
  );
};
