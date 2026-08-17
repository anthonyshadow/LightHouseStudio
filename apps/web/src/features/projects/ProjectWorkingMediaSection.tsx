import { useTheme } from '@emotion/react';
import type { ProjectCurrentResponse, SavedVideoSummary } from '@studio/contracts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, StatusNotice } from '../../ui';
import { ProjectSavedVideoPicker } from './ProjectSavedVideoPicker';
import {
  getProjectWorkingMedia,
  ProjectApiConflictError,
  reuseProjectWorkingMedia,
} from './projectsApi';
import type { ProjectSessionPort } from './useProjectSession';
import { useStableOperationKey } from './useStableOperationKey';

type AdoptionPhase = 'idle' | 'saving' | 'saved' | 'conflict' | 'error';

const adoptionPhaseNotice = {
  idle: { role: 'status', tone: 'success', title: 'Working media ready' },
  saving: { role: 'status', tone: 'neutral', title: 'Saving working media' },
  saved: { role: 'status', tone: 'success', title: 'Working media ready' },
  conflict: { role: 'alert', tone: 'warning', title: 'Conflict' },
  error: { role: 'alert', tone: 'danger', title: 'Working media not changed' },
} as const satisfies Record<
  AdoptionPhase,
  {
    readonly role: 'alert' | 'status';
    readonly tone: 'neutral' | 'success' | 'warning' | 'danger';
    readonly title: string;
  }
>;

export interface ProjectWorkingMediaActivity {
  readonly projectId: string;
  readonly busy: boolean;
}

export const ProjectWorkingMediaSection = ({
  current,
  session,
  archived,
  onActivityChange,
}: {
  readonly current: ProjectCurrentResponse;
  readonly session: ProjectSessionPort;
  readonly archived: boolean;
  readonly onActivityChange?: (activity: ProjectWorkingMediaActivity) => void;
}) => {
  const theme = useTheme();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const operation = useStableOperationKey();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [phase, setPhase] = useState<AdoptionPhase>('idle');
  const [message, setMessage] = useState<string | null>(null);
  const snapshot = current.revision.snapshot;
  const busy = phase === 'saving';

  useEffect(() => {
    onActivityChange?.({ projectId: current.project.id, busy });
    return () => onActivityChange?.({ projectId: current.project.id, busy: false });
  }, [busy, current.project.id, onActivityChange]);

  const adoptVersion = useCallback(
    async (video: SavedVideoSummary) => {
      setPickerOpen(false);
      if (!(await session.flush())) {
        setPhase('conflict');
        setMessage('Resolve the preserved Project proposal before changing working media.');
        return;
      }
      const latest = session.getCurrent();
      if (latest === null) return;
      const signature = JSON.stringify({
        projectId: latest.project.id,
        expectedVersion: latest.project.version,
        expectedRevisionNumber: latest.project.currentRevisionNumber,
        savedVideoId: video.id,
        videoVersionId: video.currentVersion.id,
      });
      const operationKey = operation.keyFor(signature);
      setPhase('saving');
      setMessage('Validating the exact retained Version and adopting its existing bytes.');
      try {
        let response;
        try {
          response = await reuseProjectWorkingMedia({
            projectId: latest.project.id,
            operationKey,
            expectedVersion: latest.project.version,
            expectedRevisionNumber: latest.project.currentRevisionNumber,
            media: {
              kind: 'saved-video-version',
              savedVideoId: video.id,
              videoVersionId: video.currentVersion.id,
            },
            localEdit: null,
          });
        } catch (error) {
          if (error instanceof ProjectApiConflictError) throw error;
          const reconciled = await getProjectWorkingMedia(latest.project.id);
          if (
            reconciled.media.reference.kind !== 'saved-video-version' ||
            reconciled.media.reference.savedVideoId !== video.id ||
            reconciled.media.reference.videoVersionId !== video.currentVersion.id
          ) {
            throw error;
          }
          response = reconciled;
        }
        if (!response.isCurrent) {
          setPhase('conflict');
          setMessage(
            'The exact Version was retained by a historical revision, but newer Project work remains current.',
          );
          return;
        }
        session.acceptCurrent({ project: response.project, revision: response.revision });
        operation.reset();
        setPhase('saved');
        setMessage(
          'Working media ready from the exact retained Version. Bytes were not copied, the original was not replaced, and no output Version was created.',
        );
      } catch (error) {
        setPhase(error instanceof ProjectApiConflictError ? 'conflict' : 'error');
        setMessage(
          error instanceof ProjectApiConflictError
            ? 'The Project changed before this Version could become current working media.'
            : 'The exact retained Version could not be adopted safely.',
        );
      }
    },
    [operation, session],
  );

  if (snapshot.sourceAssetId === null) return null;
  return (
    <>
      <section
        aria-labelledby="project-working-media-heading"
        css={{
          display: 'grid',
          gap: theme.space.sm,
          padding: theme.space.md,
          border: `1px solid ${theme.colors.border}`,
          borderRadius: theme.radii.large,
          background: theme.colors.surfaceSoft,
        }}
      >
        <div>
          <h3 id="project-working-media-heading">Durable working media</h3>
          <p>
            The media stage presents the current ready working reference. The immutable original
            remains retained separately even after working media advances.
          </p>
        </div>
        {message ? (
          <StatusNotice
            role={adoptionPhaseNotice[phase].role}
            tone={adoptionPhaseNotice[phase].tone}
            title={adoptionPhaseNotice[phase].title}
          >
            {message}
          </StatusNotice>
        ) : null}
        <div>
          <Button
            ref={triggerRef}
            busy={phase === 'saving'}
            disabled={archived || phase === 'saving'}
            onClick={() => setPickerOpen(true)}
          >
            Use Saved Video as working media
          </Button>
          <small>
            Selects one exact same-owner Version. It never infers an Add Version target or Project
            output provenance.
          </small>
        </div>
      </section>
      <ProjectSavedVideoPicker
        open={pickerOpen}
        busy={phase === 'saving'}
        returnFocusRef={triggerRef}
        onClose={() => setPickerOpen(false)}
        onSelect={(video) => void adoptVersion(video)}
      />
    </>
  );
};
