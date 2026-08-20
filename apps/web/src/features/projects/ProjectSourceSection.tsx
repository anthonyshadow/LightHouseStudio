import { useTheme } from '@emotion/react';
import type { ProjectCurrentResponse } from '@studio/contracts';
import { useRef, useState } from 'react';
import { Button, ConfirmationDialog, StatusNotice } from '../../ui';
import { emptyProjectStyles } from './ProjectRouteSurface.styles';
import { ProjectSavedVideoPicker } from './ProjectSavedVideoPicker';
import {
  useProjectSourceController,
  type ProjectSourceActivity,
  type ProjectSourcePhase,
  type ProjectSourceRuntime,
} from './useProjectSourceController';

export interface ProjectRecordingCandidate {
  readonly file: File;
  readonly ready: boolean;
}

/** The stand-in for a surface mounted where no live-media runtime exists to take a source. */
export const unavailableSourceRuntime: ProjectSourceRuntime = {
  available: false,
  present: () => undefined,
  clear: () => undefined,
};

interface ProjectSourceNotice {
  readonly title: string;
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger';
  readonly body: string;
}

const projectSourceNotice = (
  phase: ProjectSourcePhase,
  message: string | null,
): ProjectSourceNotice | null => {
  switch (phase) {
    case 'hydrating':
      return {
        title: 'Preparing video',
        tone: 'neutral',
        body: 'Loading this Project’s original video onto the stage.',
      };
    case 'preparing':
      return {
        title: 'Preparing video',
        tone: 'neutral',
        body: 'Uploading and checking your video. You can reopen this Project once it is saved.',
      };
    case 'saving':
      return {
        title: 'Saving changes',
        tone: 'neutral',
        body: 'Saving the video and this change to your Project.',
      };
    case 'removing':
      return {
        title: 'Removing video',
        tone: 'neutral',
        body: 'Removing the original video from this Project.',
      };
    case 'saved':
      return null;
    case 'conflict':
      return {
        title: 'Conflict',
        tone: 'warning',
        body: message ?? 'The Project changed. Refresh before trying again.',
      };
    case 'error':
      return {
        title: 'Video not saved',
        tone: 'danger',
        body: message ?? 'That video was not accepted.',
      };
    case 'idle':
      return null;
  }
};

export const ProjectSourceSection = ({
  current,
  runtime,
  recordingCandidate,
  recordingActive = false,
  removalBlockedReason,
  onStartRecording,
  onActivityChange,
  onCurrentChange,
}: {
  readonly current: ProjectCurrentResponse;
  readonly runtime: ProjectSourceRuntime;
  readonly recordingCandidate?: ProjectRecordingCandidate | null | undefined;
  readonly recordingActive?: boolean | undefined;
  readonly removalBlockedReason?: string | undefined;
  readonly onStartRecording?: (() => void) | undefined;
  readonly onActivityChange?: ((activity: ProjectSourceActivity) => void) | undefined;
  readonly onCurrentChange?: ((current: ProjectCurrentResponse) => void) | undefined;
}) => {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const savedVideoTriggerRef = useRef<HTMLButtonElement>(null);
  const removeTriggerRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const controller = useProjectSourceController(
    current.project.id,
    current,
    runtime,
    onActivityChange,
    onCurrentChange,
  );
  const archived = current.project.archivedAt !== null;
  const controlsDisabled = archived || controller.busy || controller.accepted;
  const stateNotice = projectSourceNotice(controller.phase, controller.message);
  // The controller's phase/message stay the single owner of the failure text; the dialog just
  // renders it where the operator is looking when a removal is refused.
  const removalFailure =
    controller.phase === 'conflict' || controller.phase === 'error'
      ? (controller.message ?? undefined)
      : undefined;

  return (
    <>
      <section css={emptyProjectStyles(theme)} aria-labelledby="project-source-heading">
        <div>
          <h3 id="project-source-heading">
            {controller.accepted ? 'Original video ready' : 'No original video yet'}
          </h3>
          {controller.accepted && controller.source ? (
            <>
              <p>
                {controller.source.filename} · {controller.source.width}×{controller.source.height}{' '}
                · {Math.round(controller.source.durationMs / 1_000)} seconds
              </p>
              <p>
                {controller.source.kind === 'saved-video-version'
                  ? 'This Project works from a video already in your library. That video is not changed.'
                  : 'This Project works from this video. Remove it to start from a different one.'}
              </p>
            </>
          ) : (
            <p>
              Choose the one video this Project works from. You can try again if an upload fails,
              and you can remove it later to choose a different one.
            </p>
          )}
          {stateNotice ? (
            <StatusNotice
              role={
                controller.phase === 'error' || controller.phase === 'conflict' ? 'alert' : 'status'
              }
              tone={stateNotice.tone}
              title={stateNotice.title}
              css={{ marginBlockStart: theme.space.md }}
            >
              {stateNotice.body}
            </StatusNotice>
          ) : null}
        </div>
        <div data-source-actions>
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            hidden
            disabled={controlsDisabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = '';
              if (file) void controller.upload(file);
            }}
          />
          {recordingCandidate?.ready && !controller.accepted ? (
            <Button
              variant="primary"
              busy={controller.busy}
              disabled={archived || controller.busy}
              onClick={() => void controller.acceptRecording(recordingCandidate.file)}
            >
              Use finalized recording
            </Button>
          ) : (
            <Button
              disabled={controlsDisabled || onStartRecording === undefined}
              busy={recordingActive}
              onClick={onStartRecording}
            >
              Record
            </Button>
          )}
          <Button
            disabled={controlsDisabled || !runtime.available}
            onClick={() => inputRef.current?.click()}
          >
            Upload
          </Button>
          <Button
            ref={savedVideoTriggerRef}
            disabled={controlsDisabled || !runtime.available}
            onClick={() => setPickerOpen(true)}
          >
            Use Saved Video
          </Button>
          {controller.accepted ? (
            <Button
              ref={removeTriggerRef}
              variant="danger"
              data-source-action="remove"
              disabled={archived || controller.busy}
              onClick={() => setRemoveDialogOpen(true)}
            >
              Remove original video
            </Button>
          ) : null}
          <small>Choosing, recording, or reopening a video never starts paid AI work.</small>
        </div>
      </section>
      {removeDialogOpen ? (
        <ConfirmationDialog
          open
          title="Remove original video"
          description="This Project goes back to choosing a video."
          body={
            <>
              <p>
                Remove “{controller.source?.filename ?? 'this video'}” as the original video for
                this Project? The video itself is not deleted, and saved versions, Project history
                and your saved progress are all kept.
              </p>
              {removalBlockedReason === undefined ? null : <p>{removalBlockedReason}</p>}
            </>
          }
          confirmLabel="Remove original video"
          cancelLabel="Cancel"
          danger
          busy={controller.busy}
          confirmDisabled={removalBlockedReason !== undefined}
          alert={removalFailure}
          alertTitle="Original video not removed"
          returnFocusRef={removeTriggerRef}
          onCancel={() => setRemoveDialogOpen(false)}
          onConfirm={() => {
            void controller.remove().then((removed) => {
              if (removed) setRemoveDialogOpen(false);
            });
          }}
        />
      ) : null}
      <ProjectSavedVideoPicker
        open={pickerOpen}
        busy={controller.busy}
        title="Choose the original video"
        returnFocusRef={savedVideoTriggerRef}
        onClose={() => setPickerOpen(false)}
        onSelect={(video) => {
          setPickerOpen(false);
          void controller.reuseSavedVideo(video);
        }}
      />
    </>
  );
};
