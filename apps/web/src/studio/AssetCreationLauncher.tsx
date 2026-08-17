import { useTheme } from '@emotion/react';
import type { VoiceSummary } from '@studio/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useState, type RefObject } from 'react';
import { attachProjectAssetAndSync } from '../features/projects/useProjectAssetsController';
import { Button, OverlayPanel, StatusNotice } from '../ui';

const VoiceLibrary = lazy(() =>
  import('../features/voice-effects/VoiceLibrary').then((module) => ({
    default: module.VoiceLibrary,
  })),
);

type LauncherView = 'types' | 'video' | 'voice';

export type AssetCreationLauncherProps = Readonly<{
  open: boolean;
  projectId: string | null;
  returnFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onCreateVideo: (intent: 'new' | 'record' | 'upload', projectId: string | null) => void;
  onCreateCharacter: (projectId: string | null) => void;
  onCreateOutfit: (projectId: string | null) => void;
  onOpenVoiceLibrary: () => void;
}>;

const OpenAssetCreationLauncher = ({
  projectId,
  returnFocusRef,
  onClose,
  onCreateVideo,
  onCreateCharacter,
  onCreateOutfit,
  onOpenVoiceLibrary,
}: Omit<AssetCreationLauncherProps, 'open'>) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [view, setView] = useState<LauncherView>('types');
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [pendingVoice, setPendingVoice] = useState<VoiceSummary | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);

  const close = () => {
    if (voiceBusy) return;
    onClose();
  };

  const attachVoice = async (voice: VoiceSummary) => {
    if (!projectId || voiceBusy) return;
    setPendingVoice(voice);
    setVoiceBusy(true);
    setVoiceError(null);
    try {
      await attachProjectAssetAndSync(queryClient, projectId, {
        kind: 'voice',
        resourceId: voice.voiceId,
      });
      onClose();
    } catch {
      setVoiceError(
        'The Voice remains saved, but it could not be attached to this Project. Retry when ready.',
      );
    } finally {
      setVoiceBusy(false);
    }
  };

  const choose = (kind: 'video' | 'character' | 'outfit' | 'voice') => {
    if (kind === 'video') {
      setView('video');
      return;
    }
    if (kind === 'voice') {
      if (projectId) setView('voice');
      else {
        onClose();
        onOpenVoiceLibrary();
      }
      return;
    }
    onClose();
    if (kind === 'character') onCreateCharacter(projectId);
    else onCreateOutfit(projectId);
  };

  const title = view === 'voice' ? 'Add Voice' : view === 'video' ? 'Create Video' : 'Create Asset';
  const description =
    projectId === null
      ? 'Create a supported Asset using its existing Lightframe workflow.'
      : 'Create and save an Asset, then attach it to the current Project without changing its source.';

  return (
    <OverlayPanel
      open
      onClose={close}
      title={title}
      description={description}
      placement={view === 'voice' ? 'fullscreen' : 'bottom'}
      size="wide"
      bodyMode={view === 'voice' ? 'scroll' : 'contained'}
      closeDisabled={voiceBusy}
      initialFocus="heading"
      returnFocusRef={returnFocusRef}
      headerEyebrow={
        view !== 'types' ? (
          <Button
            size="small"
            variant="quiet"
            disabled={voiceBusy}
            onClick={() => setView('types')}
          >
            ‹ Asset types
          </Button>
        ) : undefined
      }
    >
      {view === 'types' ? (
        <div
          css={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))',
            gap: theme.space.sm,
          }}
        >
          <Button variant="secondary" onClick={() => choose('video')}>
            Video
          </Button>
          <Button variant="secondary" onClick={() => choose('character')}>
            Character
          </Button>
          <Button variant="secondary" onClick={() => choose('outfit')}>
            Outfit
          </Button>
          <Button variant="secondary" onClick={() => choose('voice')}>
            Add Voice
          </Button>
        </div>
      ) : null}

      {view === 'video' ? (
        <div css={{ display: 'grid', gap: theme.space.sm }}>
          <Button variant="secondary" onClick={() => onCreateVideo('new', projectId)}>
            New Video
          </Button>
          <Button variant="secondary" onClick={() => onCreateVideo('record', projectId)}>
            Record Video
          </Button>
          <Button variant="secondary" onClick={() => onCreateVideo('upload', projectId)}>
            Upload Video
          </Button>
        </div>
      ) : null}

      {view === 'voice' ? (
        <div css={{ display: 'grid', gap: theme.space.sm }}>
          {voiceError ? (
            <StatusNotice tone="danger" role="alert" title="Project attachment failed">
              <p>{voiceError}</p>
              {pendingVoice ? (
                <Button
                  size="small"
                  busy={voiceBusy}
                  onClick={() => void attachVoice(pendingVoice)}
                >
                  Retry attachment
                </Button>
              ) : null}
            </StatusNotice>
          ) : null}
          <Suspense fallback={<p role="status">Loading Voices…</p>}>
            <VoiceLibrary disabled={voiceBusy} onSelect={(voice) => void attachVoice(voice)} />
          </Suspense>
        </div>
      ) : null}
    </OverlayPanel>
  );
};

export const AssetCreationLauncher = ({ open, ...props }: AssetCreationLauncherProps) =>
  open ? <OpenAssetCreationLauncher {...props} /> : null;
